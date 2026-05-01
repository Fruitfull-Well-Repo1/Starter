export interface PBWebhookEvent {
  event: "message.created" | string;
  delivered_at: string;
  data: {
    message_id: string;
    thread_id: string;
    client_id: string;
    body: string;
    received_at: string;
  };
}

export interface PBClientProfile {
  id: string;
  name: string;
  email?: string;
  intake_summary?: string;
}

export interface PBMessage {
  id: string;
  thread_id: string;
  sender: "client" | "practitioner";
  body: string;
  sent_at: string;
}

export interface PBAppointment {
  id: string;
  date: string;
  type: string;
  notes?: string;
}

export interface PBFormHighlight {
  form: string;
  field: string;
  value: string;
}
