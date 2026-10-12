import markUrl from '../../assets/brand/mark.svg?no-inline';

export function WildTrackMark({ size = 40, alt = '', className }) {
  return (
    <img
      className={className}
      src={markUrl}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt ? undefined : true}
    />
  );
}
