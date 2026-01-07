// /lib/connectors/lodgify/index.ts
export { sendMessage } from './sendMessage'
export { getRecentReservations, getReservationMessages } from './getMessages'
export type { 
  LodgifyReservation, 
  LodgifyMessage, 
  GetReservationsResult, 
  GetMessagesResult 
} from './getMessages'