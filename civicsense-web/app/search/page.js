import { redirect } from 'next/navigation';
import { getSession } from '../../lib/auth';
import SearchBox from './SearchBox';

export default function SearchPage() {
  if (!getSession()) redirect('/login');
  return <SearchBox />;
}
