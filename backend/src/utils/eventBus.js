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
  registerClient(res) {
    this.clients.add(res);
    
    res.on('close', () => {
      this.clients.delete(res);
    });
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
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (err) {
        console.error('Error writing to SSE client:', err.message);
        this.clients.delete(client);
      }
    }
  }
}

const eventBus = new EventBus();
module.exports = eventBus;
