import { getDb } from '@/lib/data';
import { verifyTrackToken } from '@/lib/track-token';
import { trackStepper, isClientVisibleStage } from '@/lib/funnel-track-copy';
import { AAC_PROJECT_MILESTONES } from '@/lib/project-milestones';

export const dynamic = 'force-dynamic';

// Loaded via a plain Google Fonts <link> in app/layout.tsx's public-tracker
// branch, not next/font/google — see that file's comment for why (this page
// also has to import cleanly under Vitest, where next/font's SWC-only
// transform doesn't run).
const FONT_PLAYFAIR = "'Playfair Display', Georgia, serif";
const FONT_MONTSERRAT = "'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif";

// The APEX Framed Standard palette (PLAYBOOK/BRAND_REFERENCE.md) — this page
// is the one place in arise-os that renders in AAC's CLIENT-facing brand
// rather than the internal os.* dashboard theme, so the tokens are scoped
// locally instead of pulled from tailwind.config.ts's os.* palette.
const APEX = {
  charcoal: '#1C1A17',
  deepCharcoal: '#2A2622',
  gold: '#B8894A',
  goldSoft: '#C9A36A',
  cream: '#F6F4EF',
  cream2: '#EDEAE2',
  textMedium: '#4B5563',
  textLight: '#6B7280',
  success: '#16a34a',
};

function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: APEX.cream,
        color: APEX.charcoal,
        fontFamily: FONT_MONTSERRAT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
      }}
    >
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <p style={{ fontFamily: FONT_PLAYFAIR, fontSize: 22, fontWeight: 700, letterSpacing: '0.02em' }}>
          ARISE ABOVE
        </p>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', color: APEX.gold, marginTop: 2 }}>
          CONSTRUCTION
        </p>
        <p style={{ marginTop: 28, fontSize: 15, color: APEX.textMedium, lineHeight: 1.6 }}>
          We couldn&apos;t find that tracker link. Links are personal to your project — if you followed a link from a
          text or email and it&apos;s not working, give us a call and we&apos;ll get you sorted.
        </p>
        <p style={{ marginTop: 20, fontSize: 14, fontWeight: 600 }}>(248) 717-1417</p>
      </div>
    </div>
  );
}

export default async function TrackPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const contactId = verifyTrackToken(params.token);
  if (!contactId) return <NotFound />;

  const journey = getDb().funnel.journeys().find((j) => j.id === contactId);
  // Tracker links are an AAC-only client-facing concept (see
  // lib/funnel-track-copy.ts's header comment) — an Apps journey or a stage
  // that isn't client-visible yet (inquiry/follow_up/negotiation) reads
  // identically to "not found," never a different message that would tell
  // an outside party whether a given token maps to something real.
  if (!journey || journey.business !== 'aac' || !isClientVisibleStage(journey.status)) return <NotFound />;

  const steps = trackStepper(journey.status);
  const clientName = journey.person ?? journey.name.split(' ')[0] ?? journey.name;
  const showMilestones = journey.status === 'active_project';
  const completed = showMilestones ? getDb().projectMilestones.forContact(contactId) : [];
  const doneIds = new Set(completed.map((m) => m.milestoneId));

  return (
    <div
      style={{
        minHeight: '100vh',
        background: APEX.cream,
        color: '#2D2D2D',
        fontFamily: FONT_MONTSERRAT,
        padding: '40px 20px 64px',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: 36 }}>
          <p style={{ fontFamily: FONT_PLAYFAIR, fontSize: 24, fontWeight: 700, letterSpacing: '0.02em', color: APEX.charcoal }}>
            ARISE ABOVE
          </p>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', color: APEX.gold, marginTop: 2 }}>
            CONSTRUCTION
          </p>
        </header>

        <div
          style={{
            background: '#fff',
            border: `1px solid ${APEX.cream2}`,
            borderRadius: 10,
            padding: '28px 24px',
            boxShadow: '0 1px 3px rgba(28,26,23,0.06)',
          }}
        >
          <p style={{ fontFamily: FONT_PLAYFAIR, fontSize: 19, fontWeight: 600, color: APEX.charcoal }}>
            Hi {clientName}, here&apos;s where things stand.
          </p>
          <p style={{ fontSize: 13.5, color: APEX.textMedium, marginTop: 6 }}>
            {journey.company ? `${journey.company} — ` : ''}we&apos;ll keep this page current as your project moves
            forward.
          </p>

          <ol style={{ listStyle: 'none', padding: 0, margin: '28px 0 0' }}>
            {steps.map((step, i) => (
              <li key={step.stage} style={{ display: 'flex', gap: 14, paddingBottom: i === steps.length - 1 ? 0 : 22, position: 'relative' }}>
                {i !== steps.length - 1 && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 13,
                      top: 28,
                      bottom: -6,
                      width: 2,
                      background: step.state === 'done' ? APEX.gold : APEX.cream2,
                    }}
                  />
                )}
                <span
                  style={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: step.state === 'upcoming' ? APEX.textLight : '#fff',
                    background: step.state === 'done' ? APEX.success : step.state === 'current' ? APEX.gold : APEX.cream2,
                    zIndex: 1,
                  }}
                >
                  {step.state === 'done' ? '✓' : step.step}
                </span>
                <span style={{ paddingTop: 3 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 14.5,
                      fontWeight: 600,
                      color: step.state === 'upcoming' ? APEX.textLight : APEX.charcoal,
                    }}
                  >
                    {step.title}
                    {step.state === 'current' && (
                      <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: APEX.gold }}>
                        IN PROGRESS
                      </span>
                    )}
                  </span>
                  <span style={{ display: 'block', fontSize: 12.5, color: APEX.textLight, marginTop: 1 }}>
                    {step.description}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {showMilestones && (
            <div style={{ marginTop: 30, paddingTop: 24, borderTop: `1px solid ${APEX.cream2}` }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: APEX.gold, marginBottom: 12 }}>
                TRADE PROGRESS
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {AAC_PROJECT_MILESTONES.map((m) => {
                  const done = doneIds.has(m.id);
                  return (
                    <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          color: '#fff',
                          background: done ? APEX.success : APEX.cream2,
                        }}
                      >
                        {done ? '✓' : ''}
                      </span>
                      <span style={{ color: done ? APEX.charcoal : APEX.textLight }}>{m.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <footer style={{ textAlign: 'center', marginTop: 28, fontSize: 11.5, color: APEX.textLight }}>
          <p>Questions any time — (248) 717-1417 · info@ariseaboveconstruction.com</p>
          <p style={{ marginTop: 4 }}>Licensed · MBE Certified · Fully Insured</p>
        </footer>
      </div>
    </div>
  );
}
