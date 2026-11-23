// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell } from '@mantine/core';
import { ErrorBoundary, useMedplum } from '@medplum/react';
import { lazy, Suspense } from 'react';
import type { JSX } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Router } from './Router';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Loading } from './components/Loading';
import { RegisterPage } from './pages/RegisterPage';
import { SignInPage } from './pages/SignInPage';
import { LandingPage } from './pages/landing';

// Development only: Find a chemist against simulated chemists (left out of builds)
const FindChemistPreview = import.meta.env?.DEV ? lazy(() => import('./erx/FindChemistPreview')) : undefined;

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const location = useLocation();

  if (FindChemistPreview && location.pathname === '/preview/find-a-chemist') {
    return (
      <Suspense fallback={<Loading />}>
        <FindChemistPreview />
      </Suspense>
    );
  }

  if (medplum.isLoading()) {
    return null;
  }

  if (!medplum.getProfile()) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="signin" element={<SignInPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    );
  }

  return (
    <AppShell header={{ height: 80 }}>
      <Header />
      <AppShell.Main>
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <Router />
          </Suspense>
        </ErrorBoundary>
      </AppShell.Main>
      <Footer />
    </AppShell>
  );
}
