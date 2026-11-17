import './globals.css';
import Nav from '../components/Nav';
import { getSession } from '../lib/auth';

export const metadata = {
  title: 'CivicSense',
  description: 'Semantic complaint routing and duplicate detection',
};

export default function RootLayout({ children }) {
  // read once here so every page gets the signed-in user without re-reading
  const session = getSession();
  return (
    <html lang="en">
      <body>
        <Nav session={session} />
        <main>{children}</main>
      </body>
    </html>
  );
}
