/**
 * SSE Event Bus for broadcasting real-time updates to connected admin panels and partner apps
 */
class EventBus {
  constructor() {
    this.clients = new Set();
  }

  /**
   * Register a new client connection response
   * @param {object} res - Express response stream
   */
  registerClient(res, principal) {
    const client = { res, principal };
    this.clients.add(client);
    
    res.on('close', () => {
      this.clients.delete(client);
    });
  }

  canReceive(client, type, data) {
    if (client.principal.role === 'admin') return true;
    if (client.principal.role === 'partner') {
      return data.partnerId && String(data.partnerId) === client.principal.id;
    }
    // Warehouse staff are notified only when a pickup becomes ready for audit.
    return client.principal.role === 'warehouse' && type === 'pickup_completed';
  }

  /**
   * Broadcast an event to all connected clients
   * @param {string} type - Event type name (e.g., 'partner_status_change')
   * @param {object} data - Payload object
   */
  sendEvent(type, data) {
    const payload = JSON.stringify({ type, data });
    console.log(`[SSE BROADCAST] Dispatching Event "${type}" to ${this.clients.size} connected admin panels.`);
    for (const client of this.clients) {
      if (!this.canReceive(client, type, data)) continue;
      try {
        client.res.write(`data: ${payload}\n\n`);
      } catch (err) {
        console.error('Error writing to SSE client:', err.message);
        this.clients.delete(client);
      }
    }
  }
}

const eventBus = new EventBus();
module.exports = eventBus;
