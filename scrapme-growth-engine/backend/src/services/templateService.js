'use strict';

const MessageTemplate = require('../models/MessageTemplate');

// ── Variable Key Allowlist ────────────────────────────────────
// Only alphanumeric + underscore keys may appear in {{...}} placeholders.
// This prevents injection of arbitrary property paths like {{__proto__}} or {{constructor}}.
const VARIABLE_KEY_PATTERN = /^[a-zA-Z0-9_]+$/;

// Template body must not exceed this limit to prevent memory exhaustion on render.
const MAX_TEMPLATE_BODY_BYTES = 64 * 1024; // 64 KB

/**
 * Retrieve the current active template for a slug+channel combination.
 *
 * @param {string} slug
 * @param {string} channel
 * @returns {Promise<import('../models/MessageTemplate').default|null>}
 */
async function getTemplateBySlug(slug, channel) {
  if (!slug || !channel) {
    throw new Error('slug and channel are required');
  }
  // Canonical documents have parentId: null; we look for the active one.
  return MessageTemplate.findOne({
    slug: slug.toLowerCase(),
    channel,
    status: 'active',
    parentId: null,
  });
}

/**
 * Safely substitute {{variableKey}} placeholders in a string.
 *
 * Security properties:
 *   - Only allowlisted keys ([a-zA-Z0-9_]) are substituted.
 *   - Unknown keys in the template body are replaced with an empty string,
 *     not left as raw {{...}} (prevents leaking template syntax to recipients).
 *   - Variable values are coerced to strings; objects/arrays are JSON-serialized.
 *   - HTML special characters in values are NOT escaped by this function —
 *     escaping is the responsibility of the presentation layer.
 *
 * @param {string} text
 * @param {Object} vars  Plain object of key → value pairs
 * @returns {string}
 */
function substituteVariables(text, vars) {
  if (typeof text !== 'string') return '';
  const safeVars = vars && typeof vars === 'object' ? vars : {};

  return text.replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {
    const key = rawKey.trim();

    // Reject keys that contain characters outside the allowlist
    if (!VARIABLE_KEY_PATTERN.test(key)) {
      console.warn(`[templateService] Rejected disallowed variable key: "${key}"`);
      return '';
    }

    // Resolve the value
    if (Object.prototype.hasOwnProperty.call(safeVars, key)) {
      const val = safeVars[key];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    }

    // Unknown variable → empty string (never leak raw placeholder)
    return '';
  });
}

/**
 * Render a template document with the provided variable values.
 *
 * @param {Object} template   MessageTemplate document or plain object with `content` and `variables`
 * @param {Object} vars       Key-value pairs for placeholder substitution
 * @returns {{ renderedSubject: string, renderedBody: string, missingVariables: string[] }}
 */
function renderTemplate(template, vars) {
  if (!template || !template.content) {
    throw new Error('Invalid template: missing content');
  }

  const providedKeys = Object.keys(vars || {});
  const declaredKeys = Array.isArray(template.variables) ? template.variables : [];

  // Identify declared variables that were not supplied
  const missingVariables = declaredKeys.filter(k => !providedKeys.includes(k));

  const body = template.content.body || '';
  const subject = template.content.subject || '';

  if (Buffer.byteLength(body, 'utf8') > MAX_TEMPLATE_BODY_BYTES) {
    throw new Error('Template body exceeds maximum allowed size');
  }

  const renderedBody = substituteVariables(body, vars);
  const renderedSubject = substituteVariables(subject, vars);

  return { renderedSubject, renderedBody, missingVariables };
}

/**
 * Validate that all declared template variables are present in the provided map.
 *
 * @param {Object} template
 * @param {Object} providedVars
 * @returns {{ valid: boolean, missingVariables: string[] }}
 */
function validateTemplateVariables(template, providedVars) {
  const declared = Array.isArray(template.variables) ? template.variables : [];
  const provided = providedVars && typeof providedVars === 'object' ? providedVars : {};
  const missingVariables = declared.filter(k => !Object.prototype.hasOwnProperty.call(provided, k));
  return { valid: missingVariables.length === 0, missingVariables };
}

function validateTemplateDefinition(input) {
  const content = input && input.content || {};
  const text = `${content.subject || ''}\n${content.body || ''}`;
  const placeholders = [...text.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim());
  const invalid = placeholders.filter((key) => !VARIABLE_KEY_PATTERN.test(key));
  const declared = Array.isArray(input && input.variables) ? input.variables : [];
  const undeclared = placeholders.filter((key) => !declared.includes(key));
  const unused = declared.filter((key) => !placeholders.includes(key));
  return { valid: !invalid.length && !undeclared.length, invalid, undeclared, unused };
}

/**
 * Render a template with sample/preview data.
 * Does NOT trigger any send. Returns the rendered output only.
 *
 * @param {string|Object} templateOrId  Template doc or its _id string
 * @param {Object} sampleData
 * @returns {Promise<{ renderedSubject: string, renderedBody: string, missingVariables: string[] }>}
 */
async function previewTemplate(templateOrId, sampleData) {
  let template = templateOrId;
  if (typeof templateOrId === 'string' || (templateOrId && templateOrId.constructor && templateOrId.constructor.name === 'ObjectId')) {
    template = await MessageTemplate.findById(templateOrId);
    if (!template) {
      throw new Object.assign(new Error('Template not found'), { statusCode: 404 });
    }
  }

  return renderTemplate(template, sampleData || {});
}

/**
 * Create a new version of an existing template (preserves history).
 *
 * Strategy:
 *   1. Clone the existing document (sets parentId = original._id, increments version)
 *   2. Update the original document in-place with the new content
 *
 * Automations reference templates by slug, so they always resolve to the
 * canonical (parentId: null) document, which is now the updated version.
 * The clone preserves the history.
 *
 * @param {Object} existingTemplate  Mongoose document
 * @param {Object} updates           New field values
 * @returns {Promise<{ updated: Object, historicalClone: Object }>}
 */
async function createNewVersion(existingTemplate, updates) {
  // Build the historical clone from current state
  const cloneData = {
    name: existingTemplate.name,
    slug: existingTemplate.slug,
    description: existingTemplate.description,
    channel: existingTemplate.channel,
    messageType: existingTemplate.messageType,
    status: 'archived', // Historical versions are always archived
    content: existingTemplate.content,
    variables: existingTemplate.variables,
    channelMeta: existingTemplate.channelMeta,
    version: existingTemplate.version,
    parentId: existingTemplate._id,
    createdBy: existingTemplate.createdBy,
  };
  const historicalClone = await MessageTemplate.create(cloneData);

  // Apply updates to the canonical document
  const allowedUpdates = ['name', 'description', 'status', 'content', 'variables', 'channelMeta', 'messageType'];
  for (const key of allowedUpdates) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      existingTemplate[key] = updates[key];
    }
  }
  existingTemplate.version = existingTemplate.version + 1;
  const updated = await existingTemplate.save();

  return { updated, historicalClone };
}

module.exports = {
  getTemplateBySlug,
  renderTemplate,
  validateTemplateVariables,
  previewTemplate,
  createNewVersion,
  substituteVariables, // exported for unit testing
  validateTemplateDefinition,
};
