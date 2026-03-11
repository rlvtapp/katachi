export type Props = {
  className: string;
  tone: string;
  size: string;
  name: string;
};

export default function Glyph({ className, tone, size, name }: Props) {
  return (
    <svg
      className={className}
      data-tone={tone}
      data-size={size}
      data-name={name}
    />
  );
}
