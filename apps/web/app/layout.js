import './globals.css';

export const metadata = {
  title: 'Previley Transformer',
  description: 'Excel transformation platform'
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
