const ALLOWLISTED_FIELDS = new Set([
  'customerStatus',
  'completedOrders',
  'totalOrders',
  'totalRevenue',
  'acquisitionSource',
  'acquisitionMedium',
  'acquisitionCampaign',
  'influencerId',
  'referralCode',
  'tags',
  'firstSeenAt',
  'lastActivityAt',
  'segments'
]);

function evaluateCondition(customer, condition) {
  const { field, operator, value } = condition;

  if (!ALLOWLISTED_FIELDS.has(field)) {
    console.warn(`Condition field not allowlisted: ${field}`);
    return false;
  }

  // Get field value from customer
  let customerValue = customer[field];

  // Safeguard ObjectId and non-primitive objects to compare string representation
  if (customerValue && typeof customerValue === 'object' && !(customerValue instanceof Date) && !Array.isArray(customerValue)) {
    customerValue = customerValue.toString();
  }
  let compareValue = value;
  if (compareValue && typeof compareValue === 'object' && !(compareValue instanceof Date) && !Array.isArray(compareValue)) {
    compareValue = compareValue.toString();
  }

  // Safely handle Date comparisons
  if (customerValue instanceof Date || (typeof customerValue === 'string' && !isNaN(Date.parse(customerValue)) && (field === 'firstSeenAt' || field === 'lastActivityAt'))) {
    customerValue = new Date(customerValue).getTime();
  }
  if (compareValue instanceof Date || (typeof compareValue === 'string' && !isNaN(Date.parse(compareValue)) && (field === 'firstSeenAt' || field === 'lastActivityAt'))) {
    compareValue = new Date(compareValue).getTime();
  }

  switch (operator) {
    case 'equals':
      return customerValue === compareValue;
    case 'not_equals':
      return customerValue !== compareValue;
    case 'greater_than':
      return customerValue > compareValue;
    case 'greater_than_or_equal':
      return customerValue >= compareValue;
    case 'less_than':
      return customerValue < compareValue;
    case 'less_than_or_equal':
      return customerValue <= compareValue;
    case 'exists':
      const fieldExists = customerValue !== undefined && customerValue !== null && customerValue !== '';
      return !!compareValue ? fieldExists : !fieldExists;
    case 'not_exists':
      const fieldNotExists = customerValue === undefined || customerValue === null || customerValue === '';
      return !!compareValue ? fieldNotExists : !fieldNotExists;
    case 'contains':
      if (Array.isArray(customerValue)) {
        return customerValue.includes(compareValue);
      }
      if (typeof customerValue === 'string') {
        return customerValue.includes(compareValue);
      }
      return false;
    case 'in':
      if (Array.isArray(compareValue)) {
        return compareValue.includes(customerValue);
      }
      return false;
    case 'not_in':
      if (Array.isArray(compareValue)) {
        return !compareValue.includes(customerValue);
      }
      return false;
    default:
      console.warn(`Condition operator not supported: ${operator}`);
      return false;
  }
}

function evaluateConditions(customer, conditions) {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return true; // No conditions means auto-matching
  }
  for (const condition of conditions) {
    if (!evaluateCondition(customer, condition)) {
      return false;
    }
  }
  return true;
}

module.exports = {
  evaluateConditions,
  evaluateCondition,
  ALLOWLISTED_FIELDS
};
