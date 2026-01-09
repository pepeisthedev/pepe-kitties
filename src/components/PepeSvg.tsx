import pepeSvg from "./image/pepe.svg?raw";

type PepeSvgProps = {
  color: string;
  className?: string;
};

export default function PepeSvg({ color, className }: PepeSvgProps) {
  const coloredSvg = pepeSvg.replaceAll("#65b449", color);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: coloredSvg }}
    />
  );
}
