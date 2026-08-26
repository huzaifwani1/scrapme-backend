module.exports = {
  abandonedRequest: {
    name: 'Abandoned Request Follow-up',
    description: 'Send message 60 minutes after customer abandons request',
    trigger: {
      type: 'event',
      eventType: 'request_abandoned',
      delayMinutes: 60
    },
    conditions: [],
    actions: [
      {
        type: 'send_message',
        channel: 'email',
        templateId: 'abandoned_request_email'
      },
      {
        type: 'send_message',
        channel: 'whatsapp',
        templateId: 'abandoned_request_whatsapp'
      }
    ],
    status: 'draft'
  },

  firstTimeSeller: {
    name: 'First-Time Seller Follow-up',
    description: 'Generate retention action for first completed pickup order',
    trigger: {
      type: 'event',
      eventType: 'pickup_completed',
      delayMinutes: 0
    },
    conditions: [
      {
        field: 'completedOrders',
        operator: 'equals',
        value: 1
      }
    ],
    actions: [
      {
        type: 'send_message',
        channel: 'email',
        templateId: 'first_time_seller_retention'
      }
    ],
    status: 'draft'
  },

  repeatSeller: {
    name: 'Repeat Seller Loyalty Action',
    description: 'Loyalty action triggered for customers in repeat seller segment',
    trigger: {
      type: 'event',
      eventType: 'segment_assigned',
      delayMinutes: 0
    },
    conditions: [
      {
        field: 'segments',
        operator: 'contains',
        value: 'repeat_seller'
      }
    ],
    actions: [
      {
        type: 'send_message',
        channel: 'email',
        templateId: 'repeat_seller_loyalty'
      }
    ],
    status: 'draft'
  },

  inactiveCustomer: {
    name: 'Inactive Customer Reactivation',
    description: 'Reactivation action for inactive customer segment',
    trigger: {
      type: 'event',
      eventType: 'segment_assigned',
      delayMinutes: 0
    },
    conditions: [
      {
        field: 'segments',
        operator: 'contains',
        value: 'inactive_customer'
      }
    ],
    actions: [
      {
        type: 'send_message',
        channel: 'email',
        templateId: 'inactive_customer_reactivation'
      }
    ],
    status: 'draft'
  },

  highValueCustomer: {
    name: 'High Value Retention Action',
    description: 'Retention action for high value customer segment',
    trigger: {
      type: 'event',
      eventType: 'segment_assigned',
      delayMinutes: 0
    },
    conditions: [
      {
        field: 'segments',
        operator: 'contains',
        value: 'high_value_customer'
      }
    ],
    actions: [
      {
        type: 'send_message',
        channel: 'email',
        templateId: 'high_value_retention'
      }
    ],
    status: 'draft'
  }
};
