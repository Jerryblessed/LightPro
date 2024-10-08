import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { ThemeProvider } from 'next-themes'
import Layout from "@/components/Layout";
import Home from '../app/App';
import Page from './page'

export default function App({ Component, pageProps }: AppProps) {

  return <ThemeProvider attribute="class">

    <Layout>

      
      <Component {...pageProps} />
    </Layout>
  </ThemeProvider>
}
