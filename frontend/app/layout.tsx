import "./globals.css";

export const metadata = {
  title: "TaskFlow | Team workspace",
  description: "A focused workspace for managing team tasks and progress.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
