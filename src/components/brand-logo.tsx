import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  variant?: "light" | "dark";
  href?: string;
};

export function BrandLogo({ variant = "light", href = "/" }: BrandLogoProps) {
  const content = (
    <span
      className={`inline-flex items-center rounded-lg ${
        variant === "dark"
          ? "bg-white px-3 py-2 shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
          : "bg-transparent"
      }`}
    >
      <Image
        src="/images/lead-host-logo.png"
        alt="Lead Host"
        width={230}
        height={40}
        priority
        className="h-10 w-auto"
      />
    </span>
  );

  return (
    <Link href={href} aria-label="Lead Host">
      {content}
    </Link>
  );
}
