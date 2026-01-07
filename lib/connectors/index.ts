// /lib/connectors/index.ts
// PMS connector factory

import * as lodgify from './lodgify'
import * as guesty from './guesty'
import * as hostaway from './hostaway'
import { SendMessageInput, SendMessageResult } from './types'

export type PmsType = 'lodgify' | 'guesty' | 'hostaway'

export async function sendMessageViaPms(
  pmsType: PmsType,
  input: SendMessageInput
): Promise<SendMessageResult> {
  switch (pmsType) {
    case 'lodgify':
      return lodgify.sendMessage(input)
    
    case 'guesty':
      return guesty.sendMessage(input)
    
    case 'hostaway':
      return hostaway.sendMessage(input)
    
    default:
      return { ok: false, error: `Unknown PMS type: ${pmsType}` }
  }
}

export type { SendMessageInput, SendMessageResult } from './types'