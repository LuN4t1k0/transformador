import { redirect } from 'next/navigation';

// Uploads now start from the home page.
export default function NewJobPage() {
  redirect('/');
}
