export function DriveIdentityValue({ registeredStudent, providerValue }) {
  const studentName = String(registeredStudent?.studentName || '').trim();
  const googleEmail = String(registeredStudent?.email || '').trim();
  const verified = Boolean(studentName && googleEmail);
  const raw = String(providerValue || '').trim();
  if (!verified && (!raw || raw === 'Unavailable')) return <strong>Unavailable</strong>;

  // Provider names/emails do not establish a registered WildTrack identity.
  const providerParts = !verified && /^(.*?)\s*\(([^()\s]+@[^()\s]+)\)$/.exec(raw);
  const emailOnly = !verified && !providerParts && /^[^\s()@]+@[^\s()@]+$/.test(raw);
  const name = verified ? studentName : providerParts ? providerParts[1].trim() : emailOnly ? '' : raw;
  const email = verified ? googleEmail : providerParts ? providerParts[2] : emailOnly ? raw : '';
  return (
    <div className="document-check-identity-value">
      {name ? <strong className="document-check-identity-name">{name}</strong> : null}
      {email ? <span className="document-check-identity-email" title={email}>
        {name ? '(' : null}<EmailWithBreaks email={email} />{name ? ')' : null}
      </span> : null}
    </div>
  );
}

function EmailWithBreaks({ email }) {
  return String(email).split(/([@.+_-])/g).map((part, index) => (
    <span key={index}>{part}{/^[@.+_-]$/.test(part) ? <wbr /> : null}</span>
  ));
}
