import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/providers';
import { router } from './app/router';
import { LoadingScreen } from '@/shared/components/ui/Skeleton';

export default function App() {
  return (
    <AppProviders>
      <RouterProvider
        router={router}
        fallbackElement={<LoadingScreen />}
        future={{ v7_startTransition: true }}
      />
    </AppProviders>
  );
}
