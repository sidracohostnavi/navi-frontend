'use client';

import React, { useState, useEffect, useRef, use } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Photo { url: string; caption: string; space: string; }

const MAX_PHOTOS = 35;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MIN_WIDTH_PX = 1024;

// ─── Space prompts — shown in each tab to guide hosts ─────────────────────────
const SPACE_PROMPTS: Record<string, string> = {
  'Living Room':    'Show the full seating area, TV setup, and natural light. Wide-angle shots work best.',
  'Kitchen':        'Highlight counter space, appliances, and any special touches guests will use daily.',
  'Dining Room':    'Show the dining table set up and how many guests it seats.',
  'Bedroom':        'Capture the bed from multiple angles, closet space, and any en-suite or view.',
  'Bathroom':       'Show the shower or tub, vanity, and any standout features like tilework or a soaking tub.',
  'Outdoor / Patio':'Show seating, views, and the overall outdoor feel — morning light works great here.',
  'Pool / Hot Tub': 'Capture the full pool or hot tub, surrounding area, and any lighting for evening shots.',
  'Garden / Yard':  'Show the space guests can enjoy — lawn, garden, fire pit, or play area.',
  'Exterior':       'Show the full front of the property, entrance, parking, and any curb appeal.',
  'Garage':         'Show the parking space, garage door, and any storage available.',
  'Laundry Room':   'Show washer, dryer, and any folding or storage space.',
};

const getPrompt = (space: string): string => {
  // Exact match first
  if (SPACE_PROMPTS[space]) return SPACE_PROMPTS[space];
  // Prefix match (e.g. "Bedroom 1", "Bathroom 2")
  const key = Object.keys(SPACE_PROMPTS).find(k => space.startsWith(k));
  if (key) return SPACE_PROMPTS[key];
  return 'Add photos that best represent this space — bright, well-composed shots convert best.';
};

// ─── Derive pre-existing spaces from property data ────────────────────────────
function deriveSpaces(rooms: any[], bedrooms: number, bathrooms: number): string[] {
  const spaces: string[] = [];

  if (rooms && rooms.length > 0) {
    // Use the actual rooms defined in Settings
    const seen: Record<string, number> = {};
    for (const room of rooms) {
      const type: string = room.type || 'Room';
      seen[type] = (seen[type] || 0) + 1;
      const count = seen[type];
      // If more than one of same type, number them
      const label = count > 1 ? `${type} ${count}` : type;
      if (!spaces.includes(label)) spaces.push(label);
    }
  } else {
    // Fall back to counts from property fields
    // Living Room is almost always present
    spaces.push('Living Room');

    if (bedrooms === 1) {
      spaces.push('Bedroom');
    } else {
      for (let i = 1; i <= bedrooms; i++) spaces.push(`Bedroom ${i}`);
    }

    // Bathrooms — handle half baths (0.5)
    const fullBaths = Math.floor(bathrooms);
    if (fullBaths === 1) {
      spaces.push('Bathroom');
    } else {
      for (let i = 1; i <= fullBaths; i++) spaces.push(`Bathroom ${i}`);
    }

    spaces.push('Kitchen');
  }

  return spaces;
}

// ─── Predefined extra spaces hosts can add ────────────────────────────────────
const EXTRA_SPACES = [
  'Dining Room', 'Outdoor / Patio', 'Pool / Hot Tub', 'Garden / Yard',
  'Exterior', 'Garage', 'Laundry Room', 'Other',
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [initialPhotos, setInitialPhotos] = useState<Photo[]>([]);
  const [propertySpaces, setPropertySpaces] = useState<string[]>([]); // from rooms/counts
  const [customSpaces, setCustomSpaces] = useState<string[]>([]);     // host-added
  const [activeTab, setActiveTab] = useState<string>('all');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [customSpaceName, setCustomSpaceName] = useState('');
  const [uploadingSpace, setUploadingSpace] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [editingCaption, setEditingCaption] = useState<number | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const dragIndexRef = useRef<number | null>(null);

  const isDirty = JSON.stringify(photos) !== JSON.stringify(initialPhotos);

  // All tabs: property spaces + custom spaces (no duplicates)
  const allSpaces = [...propertySpaces, ...customSpaces.filter(s => !propertySpaces.includes(s))];

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('cohost_properties')
        .select('listing_photos, image_url, rooms, bedrooms, bathrooms')
        .eq('id', id)
        .single();

      if (data) {
        // Normalize photos
        const raw: any[] = data.listing_photos || [];
        const normalized: Photo[] = raw
          .map((p: any) => typeof p === 'string'
            ? { url: p, caption: '', space: 'General' }
            : { url: p.url || '', caption: p.caption || '', space: p.space || 'General' })
          .filter((p: Photo) => !!p.url);
        setPhotos(normalized);
        setInitialPhotos(normalized);

        // Derive property spaces from room definitions
        const derived = deriveSpaces(data.rooms || [], data.bedrooms || 0, data.bathrooms || 0);
        setPropertySpaces(derived);

        // Any space in photos not in derived → custom
        const photoSpaces = [...new Set(normalized.map(p => p.space))];
        const custom = photoSpaces.filter(s => !derived.includes(s) && s !== 'General');
        setCustomSpaces(custom);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = { listing_photos: photos };
      if (photos.length > 0) payload.image_url = photos[0].url;
      const { error } = await supabase.from('cohost_properties').update(payload).eq('id', id);
      if (error) throw error;
      setInitialPhotos([...photos]);
    } catch (e: any) {
      alert('Error saving: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = async (files: FileList, space: string) => {
    const toUpload = Array.from(files);
    const errors: string[] = [];

    if (photos.length + toUpload.length > MAX_PHOTOS) {
      alert(`Maximum ${MAX_PHOTOS} photos allowed. You currently have ${photos.length}.`);
      return;
    }

    setUploadingSpace(space);
    setUploadErrors([]);
    const newPhotos: Photo[] = [];

    for (const file of toUpload) {
      if (file.size > MAX_FILE_BYTES) { errors.push(`${file.name}: exceeds 20 MB`); continue; }
      const ok = await checkMinResolution(file, MIN_WIDTH_PX);
      if (!ok) { errors.push(`${file.name}: must be at least ${MIN_WIDTH_PX}px wide`); continue; }

      const ext = file.name.split('.').pop();
      const spaceSlug = space.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const filePath = `${id}/${spaceSlug}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('property-images').upload(filePath, file);
      if (uploadError) { errors.push(`${file.name}: upload failed`); continue; }

      const { data: { publicUrl } } = supabase.storage.from('property-images').getPublicUrl(filePath);
      newPhotos.push({ url: publicUrl, caption: '', space });
    }

    setPhotos(prev => [...prev, ...newPhotos]);
    if (errors.length > 0) setUploadErrors(errors);
    setUploadingSpace(null);
  };

  const checkMinResolution = (file: File, minWidth: number): Promise<boolean> =>
    new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth >= minWidth);
      img.onerror = () => resolve(false);
      img.src = URL.createObjectURL(file);
    });

  const deletePhoto = (i: number) => {
    if (!confirm('Remove this photo?')) return;
    setPhotos(prev => prev.filter((_, idx) => idx !== i));
  };

  const addSpace = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!allSpaces.includes(trimmed)) {
      setCustomSpaces(prev => [...prev, trimmed]);
    }
    setActiveTab(trimmed);
    setShowAddSpace(false);
    setCustomSpaceName('');
  };

  const saveCaption = (i: number) => {
    setPhotos(prev => prev.map((p, idx) => idx === i ? { ...p, caption: captionDraft } : p));
    setEditingCaption(null);
  };

  // ── Drag-to-reorder ────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, i: number) => { dragIndexRef.current = i; e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const src = dragIndexRef.current;
    if (src === null || src === targetIndex) return;
    const next = [...photos];
    const [moved] = next.splice(src, 1);
    next.splice(targetIndex, 0, moved);
    setPhotos(next);
    dragIndexRef.current = null;
  };

  const photosForTab = (tab: string) =>
    photos.map((photo, globalIndex) => ({ photo, globalIndex }))
      .filter(({ photo }) => tab === 'all' || photo.space === tab);

  const remaining = MAX_PHOTOS - photos.length;

  if (loading) return <div className="p-8 text-center text-gray-500">Loading photos...</div>;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-5xl mx-auto p-6 pb-32 space-y-6 animate-fadeIn">

      {/* Header */}
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Photos</h2>
          <p className="text-sm text-gray-500 mt-1">{photos.length} / {MAX_PHOTOS} photos · First photo is your cover image</p>
        </div>
        <div className="text-right text-xs text-gray-400 space-y-0.5">
          <p>Min 1024 px wide · Max 20 MB per photo</p>
          <p>Max {MAX_PHOTOS} photos total</p>
        </div>
      </header>

      {/* Upload errors */}
      {uploadErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-1">
          <p className="font-semibold">Some photos were skipped:</p>
          {uploadErrors.map((e, i) => <p key={i}>• {e}</p>)}
          <button onClick={() => setUploadErrors([])} className="text-xs underline mt-1">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap border-b border-gray-200 pb-3">
        {/* All Photos */}
        <button onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === 'all' ? 'bg-[#008080] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          All Photos ({photos.length})
        </button>

        {/* Property spaces (always shown, from rooms) */}
        {propertySpaces.map(space => {
          const count = photos.filter(p => p.space === space).length;
          return (
            <button key={space} onClick={() => setActiveTab(space)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === space ? 'bg-[#008080] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {space}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === space ? 'bg-white/20 text-white' : count === 0 ? 'bg-amber-100 text-amber-600' : 'bg-gray-200 text-gray-600'}`}>
                {count === 0 ? '!' : count}
              </span>
            </button>
          );
        })}

        {/* Custom spaces */}
        {customSpaces.filter(s => !propertySpaces.includes(s)).map(space => (
          <button key={space} onClick={() => setActiveTab(space)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === space ? 'bg-[#008080] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {space} ({photos.filter(p => p.space === space).length})
          </button>
        ))}

        {/* Add Space */}
        <button onClick={() => setShowAddSpace(true)}
          className="px-4 py-2 rounded-full text-sm font-medium border border-dashed border-gray-300 text-gray-500 hover:border-[#008080] hover:text-[#008080] transition-colors flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Space
        </button>
      </div>

      {/* Add Space modal */}
      {showAddSpace && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Add a Space</h3>
              <p className="text-sm text-gray-500 mt-1">Add outdoor areas, special rooms, or anything else guests should see.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {EXTRA_SPACES.filter(s => !allSpaces.includes(s)).map(s => (
                <button key={s} onClick={() => addSpace(s)}
                  className="px-3 py-2.5 text-sm text-left rounded-xl border border-gray-200 hover:border-[#008080] hover:bg-[#008080]/5 transition-colors">
                  {s}
                </button>
              ))}
            </div>
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Custom name</p>
              <div className="flex gap-2">
                <input type="text" value={customSpaceName} onChange={e => setCustomSpaceName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSpace(customSpaceName)}
                  placeholder="e.g. Rooftop Deck, Views, Dock..."
                  className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008080]/30" />
                <button onClick={() => addSpace(customSpaceName)} disabled={!customSpaceName.trim()}
                  className="px-4 py-2 bg-[#008080] text-white rounded-xl text-sm font-semibold disabled:opacity-40">Add</button>
              </div>
            </div>
            <button onClick={() => { setShowAddSpace(false); setCustomSpaceName(''); }}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* ── All Photos tab ────────────────────────────────────────────────── */}
      {activeTab === 'all' && (
        <>
          {/* Upload zone for all */}
          {photos.length < MAX_PHOTOS && (
            <UploadZone
              label="Upload photos"
              hint={`${remaining} slot${remaining !== 1 ? 's' : ''} remaining — photos will be added to the first space tab`}
              uploading={uploadingSpace}
              uploadingLabel={uploadingSpace ? `Uploading to ${uploadingSpace}...` : ''}
              onFiles={files => {
                const targetSpace = allSpaces[0] || 'General';
                handleUpload(files, targetSpace);
              }}
            />
          )}

          {photos.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm font-medium">No photos yet</p>
              <p className="text-xs mt-1">Select a room tab above to start adding photos to each space</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">Drag to reorder · First photo is your cover image on the public listing</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.map((photo, i) => (
                  <PhotoCard key={i} photo={photo} index={i} isFirst={i === 0}
                    draggable onDragStart={e => handleDragStart(e, i)} onDragOver={handleDragOver} onDrop={e => handleDrop(e, i)}
                    onCaption={() => { setEditingCaption(i); setCaptionDraft(photo.caption); }}
                    onDelete={() => deletePhoto(i)}
                    showSpaceBadge />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Space tab ─────────────────────────────────────────────────────── */}
      {activeTab !== 'all' && (
        <div className="space-y-5">
          {/* Space header + prompt */}
          <div className="bg-[#008080]/5 border border-[#008080]/15 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 bg-[#008080]/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-[#008080]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-[#008080] text-sm">{activeTab}</p>
              <p className="text-sm text-gray-600 mt-0.5">{getPrompt(activeTab)}</p>
            </div>
          </div>

          {/* Upload zone for this space */}
          {photos.length < MAX_PHOTOS && (
            <UploadZone
              label={`Add photos to "${activeTab}"`}
              hint={`${remaining} slot${remaining !== 1 ? 's' : ''} remaining`}
              uploading={uploadingSpace === activeTab ? uploadingSpace : null}
              uploadingLabel={`Uploading to ${activeTab}...`}
              onFiles={files => handleUpload(files, activeTab)}
            />
          )}

          {/* Photos in this space */}
          {photosForTab(activeTab).length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">To reorder photos globally, use the "All Photos" tab</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {photosForTab(activeTab).map(({ photo, globalIndex }) => (
                  <PhotoCard key={globalIndex} photo={photo} index={globalIndex} isFirst={globalIndex === 0}
                    onCaption={() => { setEditingCaption(globalIndex); setCaptionDraft(photo.caption); }}
                    onDelete={() => deletePhoto(globalIndex)}
                    showSpaceBadge={false} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
              <p className="text-sm font-medium">No photos in {activeTab} yet</p>
              <p className="text-xs mt-1">Upload photos above to fill this space</p>
            </div>
          )}
        </div>
      )}

      {/* Caption editor modal */}
      {editingCaption !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900">Photo Caption</h3>
            <p className="text-xs text-gray-400">Captions help with SEO and improve accessibility for guests.</p>
            {photos[editingCaption] && (
              <div className="w-full aspect-video rounded-xl overflow-hidden bg-gray-100">
                <img src={photos[editingCaption].url} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <textarea value={captionDraft} onChange={e => setCaptionDraft(e.target.value)}
              maxLength={120} rows={2}
              placeholder="e.g. Spacious master bedroom with king bed and ocean view"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#008080]/30 resize-none"
              autoFocus />
            <p className="text-xs text-gray-400 text-right -mt-2">{captionDraft.length}/120</p>
            <div className="flex gap-3">
              <button onClick={() => setEditingCaption(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => saveCaption(editingCaption)} className="flex-1 py-2.5 rounded-xl bg-[#008080] text-white text-sm font-semibold hover:bg-[#006666]">Save Caption</button>
            </div>
          </div>
        </div>
      )}

      {/* Save FAB */}
      <div className="fixed bottom-8 right-8 z-40">
        <button onClick={handleSave} disabled={saving || !isDirty}
          className={`px-10 py-4 font-bold rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 ${isDirty ? 'bg-[#008080] text-white hover:bg-[#006666]' : 'bg-gray-400 text-white'}`}>
          {saving && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {saving ? 'Saving...' : 'Save Photos'}
        </button>
      </div>
    </main>
  );
}

// ─── Upload Zone sub-component ────────────────────────────────────────────────
function UploadZone({ label, hint, uploading, uploadingLabel, onFiles }: {
  label: string; hint: string; uploading: string | null;
  uploadingLabel: string; onFiles: (f: FileList) => void;
}) {
  return (
    <div className={`rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#008080]/40 transition-colors p-5 flex flex-col items-center gap-3 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-[#008080] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">{uploadingLabel}</p>
        </div>
      ) : (
        <>
          <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <div className="text-center">
            <p className="text-sm text-gray-600 font-medium">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
          </div>
          <label className="px-5 py-2.5 bg-[#008080] text-white text-sm font-semibold rounded-xl cursor-pointer hover:bg-[#006666] transition-colors">
            Choose Photos
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={e => { if (e.target.files) { onFiles(e.target.files); e.target.value = ''; } }} />
          </label>
        </>
      )}
    </div>
  );
}

// ─── Photo Card sub-component ─────────────────────────────────────────────────
function PhotoCard({ photo, index, isFirst, draggable, onDragStart, onDragOver, onDrop, onCaption, onDelete, showSpaceBadge }: {
  photo: Photo; index: number; isFirst: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onCaption: () => void; onDelete: () => void;
  showSpaceBadge: boolean;
}) {
  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
      className={`group relative rounded-2xl overflow-hidden aspect-square bg-gray-100 border-2 border-transparent hover:border-[#008080]/40 transition-all shadow-sm hover:shadow-md ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <img src={photo.url} alt={photo.caption || `Photo ${index + 1}`} className="w-full h-full object-cover" />

      {isFirst && (
        <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-full backdrop-blur-sm">COVER</div>
      )}
      {showSpaceBadge && photo.space && (
        <div className="absolute top-2 right-2 bg-white/85 text-gray-700 text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm max-w-[90px] truncate">
          {photo.space}
        </div>
      )}

      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-all flex flex-col items-center justify-end pb-3 gap-1.5 opacity-0 group-hover:opacity-100">
        <button onClick={onCaption}
          className="flex items-center gap-1 px-3 py-1.5 bg-white/90 text-gray-800 text-xs font-medium rounded-full hover:bg-white transition-colors">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          {photo.caption ? 'Edit caption' : 'Add caption'}
        </button>
        <button onClick={onDelete}
          className="flex items-center gap-1 px-3 py-1.5 bg-red-500/90 text-white text-xs font-medium rounded-full hover:bg-red-600 transition-colors">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          Remove
        </button>
      </div>

      {photo.caption && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/65 to-transparent px-2 pb-2 pt-5 pointer-events-none">
          <p className="text-white text-[10px] truncate">{photo.caption}</p>
        </div>
      )}
    </div>
  );
}
