// /app/cohost/settings/page.tsx
import Link from 'next/link'
import { createCohostServiceClient } from '@/lib/supabase/cohostServer'
import PmsAccountForm from './PmsAccountForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = createCohostServiceClient()
  
  const workspaceId = '11111111-1111-1111-1111-111111111111'
  
  const { data: pmsAccounts } = await supabase
    .from('cohost_pms_accounts')
    .select('id, pms_type, credentials_json, webhook_secret, created_at')
    .eq('workspace_id', workspaceId)
  
  const lodgifyAccount = pmsAccounts?.find(a => a.pms_type === 'lodgify')
  const guestyAccount = pmsAccounts?.find(a => a.pms_type === 'guesty')
  const hostawayAccount = pmsAccounts?.find(a => a.pms_type === 'hostaway')
  
  const hasLodgifyKey = !!(lodgifyAccount?.credentials_json as any)?.api_key
  const hasGuestyKey = !!(guestyAccount?.credentials_json as any)?.api_key
  const hasHostawayKey = !!(hostawayAccount?.credentials_json as any)?.api_key

  const getWebhookSecret = (account: any) => account?.webhook_secret || 'not-configured'

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <Link 
          href="/cohost/messaging/inbox"
          className="text-blue-600 hover:text-blue-800 text-sm mb-4 inline-block"
        >
          ← Back to Inbox
        </Link>
        
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">PMS Settings</h1>
          <p className="text-gray-600">Configure your property management system connections</p>
        </div>
        
        {/* Lodgify */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Lodgify</h2>
              <p className="text-sm text-gray-500">Connect your Lodgify account to auto-send messages</p>
            </div>
            {hasLodgifyKey ? (
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                ✓ Connected
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                Not configured
              </span>
            )}
          </div>
          
          <PmsAccountForm 
            workspaceId={workspaceId}
            pmsType="lodgify"
            hasExistingKey={hasLodgifyKey}
            keyLabel="API Key"
            keyHint="Find your API key in Lodgify → Settings → Integrations → API"
          />
          
          <div className="mt-4 p-3 bg-blue-50 rounded">
            <p className="text-xs font-medium text-blue-900 mb-1">Webhook URL:</p>
            <code className="text-xs text-blue-800 break-all">
              https://YOUR_DOMAIN/api/webhooks/lodgify/{workspaceId}?secret={getWebhookSecret(lodgifyAccount)}
            </code>
          </div>
        </div>
        
        {/* Guesty */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Guesty</h2>
              <p className="text-sm text-gray-500">Connect your Guesty account to auto-send messages</p>
            </div>
            {hasGuestyKey ? (
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                ✓ Connected
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                Not configured
              </span>
            )}
          </div>
          
          <PmsAccountForm 
            workspaceId={workspaceId}
            pmsType="guesty"
            hasExistingKey={hasGuestyKey}
            keyLabel="Access Token"
            keyHint="Find your access token in Guesty → Integrations → API"
          />
          
          <div className="mt-4 p-3 bg-blue-50 rounded">
            <p className="text-xs font-medium text-blue-900 mb-1">Webhook URL:</p>
            <code className="text-xs text-blue-800 break-all">
              https://YOUR_DOMAIN/api/webhooks/guesty/{workspaceId}?secret={getWebhookSecret(guestyAccount)}
            </code>
          </div>
        </div>
        
        {/* Hostaway */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Hostaway</h2>
              <p className="text-sm text-gray-500">Connect your Hostaway account to auto-send messages</p>
            </div>
            {hasHostawayKey ? (
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                ✓ Connected
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                Not configured
              </span>
            )}
          </div>
          
          <PmsAccountForm 
            workspaceId={workspaceId}
            pmsType="hostaway"
            hasExistingKey={hasHostawayKey}
            keyLabel="Access Token"
            keyHint="Find your access token in Hostaway → Settings → API"
          />
          
          <div className="mt-4 p-3 bg-blue-50 rounded">
            <p className="text-xs font-medium text-blue-900 mb-1">Webhook URL:</p>
            <code className="text-xs text-blue-800 break-all">
              https://YOUR_DOMAIN/api/webhooks/hostaway/{workspaceId}?secret={getWebhookSecret(hostawayAccount)}
            </code>
          </div>
        </div>
        
        {/* Instructions */}
        <div className="bg-yellow-50 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-yellow-900 mb-2">Setup Instructions</h3>
          <ol className="text-sm text-yellow-800 list-decimal list-inside space-y-1">
            <li>Enter your API key/token above and click Save</li>
            <li>Copy the Webhook URL shown for your PMS</li>
            <li>Replace YOUR_DOMAIN with your Vercel deployment URL</li>
            <li>Paste the webhook URL in your PMS settings</li>
            <li>Send a test message to verify it works</li>
          </ol>
        </div>
      </div>
    </div>
  )
}