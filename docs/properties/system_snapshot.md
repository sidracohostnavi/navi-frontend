# System Snapshot: Properties Management
**Date:** January 28, 2026
**Version:** 0.8.0
**Status:** Beta (Basic CRUD)

## 1. Overview
The Properties system manages the core entities of the platform: the physical rental units (`cohost_properties`). It serves as the parent entity for Calendars, Connections, and Tasks.

## 2. Component Inventory

### User Interface
| Component | Path | Description |
|-----------|------|-------------|
| **List Page** | `app/cohost/properties/page.tsx` | Main dashboard. Lists all properties with name, location, and quick actions. Fetches directly via Supabase client. |
| **Settings** | `app/cohost/settings/.../properties` | (Under Construction) Place to fine-tune settings. |
| **New Property** | `app/cohost/properties/new/page.tsx` | (Implied) Wizard to create a property manually or via import. |

### Backend Services
| Service | Path | Description |
|---------|------|-------------|
| **Import API** | `app/api/cohost/properties/import/route.ts` | Endpoint to scrape/parse an Airbnb URL and auto-fill property details (Name, Address, Photo). |

### Database Schema
| Table | Key Columns | Role |
|-------|-------------|------|
| `cohost_properties` | `id`, `workspace_id`, `name`, `address_full`, `image_url` | The master record for a rental unit. |
| `property_settings`| `property_id`, `check_in_time`, `check_out_time`, `wifi_ssid` | configuration details (metadata). |

## 3. Data Flow

### Listing
1. **Fetch:** Client (`page.tsx`) queries `cohost_properties` table directly using the Supabase JS SDK.
2. **Filter:** RLS automatically limits rows to the user's active `workspace_id`.
3. **Render:** Cards display property image and status.

### Import (Onboarding)
1. User pastes Airbnb URL.
2. API (`/import`) fetches the public HTML.
3. Scrapes `og:title`, `og:image`, and JSON-LD data.
4. Returns pre-filled form data to the UI.
5. User confirms -> `INSERT` into `cohost_properties`.

## 4. Key Configurations
- **RLS:** Strictly scoped to Workspace.
- **Images:** Stores URLs (often CDN links from Airbnb or internal Storage).
- **Amenities:** Stored as JSONB or separate relation (TBD).

## 5. Known Constraints
- **Validation:** Currently minimal. Relies on frontend.
- **De-duplication:** No strict check if the same property is added twice.
