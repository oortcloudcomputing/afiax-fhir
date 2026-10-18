import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import { IconChecklist, IconCloudLock, IconExchange, IconSettings } from '@tabler/icons-react';
import { JSX } from 'react';
import { Card } from '../components/Card';
import { CardContainer } from '../components/CardContainer';
import { Container } from '../components/Container';
import { Feature, FeatureGrid } from '../components/landing/FeatureGrid';
import { Jumbotron } from '../components/landing/Jumbotron';
import { Section } from '../components/landing/Section';
import styles from './pricing.module.css';

export default function PricingPage(): JSX.Element {
  return (
    <Layout title="Plans">
      <Container>
        <div className={styles.pricing}>
          <h1>Plans</h1>
          <p style={{ maxWidth: 720, margin: '20px auto' }}>
            Afiax is a managed service. Oortcloud runs everything for you on Afiax Cloud, in Kenya. You subscribe per
            facility, for the products you need, with a one-time onboarding fee per deployment.
          </p>
          <p style={{ maxWidth: 720, margin: '20px auto' }}>
            For prices and a quote, contact <Link href="mailto:info@afiax.africa">info@afiax.africa</Link> or call
            +254 738 000 145.
          </p>
        </div>
        <Section>
          <CardContainer>
            <Card>
              <h3>Starter</h3>
              <p>
                For clinics and health centres with up to 10 clinical staff. Full access to the products you license,
                standard Kenyan integrations (SHA, HIE, KHIS, M-Pesa) and the Afiax Helpdesk.
              </p>
            </Card>
            <Card>
              <h3>Professional</h3>
              <p>
                For hospitals and multi-specialty clinics with 10 to 50 clinical staff. Everything in Starter, sized
                for more departments, services and users.
              </p>
            </Card>
            <Card>
              <h3>Enterprise</h3>
              <p>
                For county hospitals, large private hospitals and multi-site networks. Adds dedicated support,
                contracted SLA guarantees and an allowance for custom integrations.
              </p>
            </Card>
          </CardContainer>
        </Section>
        <Jumbotron>
          <div>
            <h2>Choose your products</h2>
            <p>
              <strong>Afiax Clinical Suite</strong>: patient records, clinician workflows, SHA claims, Afiax Billing,
              Afiax Pay and Afiax DICOM.
            </p>
            <p>
              <strong>Afiax AI</strong>: an add-on to Clinical Suite for clinical decision support, imaging AI and risk
              scoring.
            </p>
            <p>
              <strong>Afiax Workspace</strong>: learning and CPD, secure messaging, locums and credentialing.
            </p>
            <p>
              Or take the <strong>full platform bundle</strong> at a discount. <Link href="/docs/products">Compare the products</Link>
            </p>
          </div>
          <div>
            <img src="/img/infrastructure-jumbotron.svg" alt="Afiax products on Afiax Cloud" width="488" height="384" />
          </div>
        </Jumbotron>
        <Section>
          <FeatureGrid columns={2}>
            <Feature title="Hosted in Kenya" icon={<IconCloudLock />}>
              Every plan runs on Afiax Cloud in Kenyan data centres, with backups, disaster recovery and security
              monitoring included.
            </Feature>
            <Feature title="National integrations included" icon={<IconExchange />}>
              SHA, the DHA Health Information Exchange, KNHTS, KHIS and M-Pesa are part of the service, and are kept up
              to date when the national systems change.
            </Feature>
            <Feature title="Onboarding" icon={<IconSettings />}>
              A one-time fee covers project set-up, facility and practitioner verification, configuration, data
              migration and training of your Training Champions.
            </Feature>
            <Feature title="Support" icon={<IconChecklist />}>
              The Afiax Helpdesk, with 24/7 cover for critical incidents and published response times.{' '}
              <Link href="/docs/afiax-cloud/support-and-sla">See service levels</Link>
            </Feature>
          </FeatureGrid>
        </Section>
        <Section>
          <CardContainer>
            <Card>
              <h3>Billing</h3>
              <p>
                Subscriptions are invoiced annually in advance, in USD. Kenyan customers can pay by M-Pesa or local bank
                transfer.
              </p>
            </Card>
            <Card>
              <h3>Partners and integrators</h3>
              <p>
                Building on Afiax? Develop against UAT with synthetic data, then go to production after review.{' '}
                <Link href="/docs/afiax-cloud/environments-and-access">Partner access</Link>
              </p>
            </Card>
            <Card>
              <h3>Next step</h3>
              <p>
                Tell us how many facilities you have, their size, and the products you need. We will come back with a
                quote and an onboarding plan. <Link href="/contact">Contact us</Link>
              </p>
            </Card>
          </CardContainer>
        </Section>
      </Container>
    </Layout>
  );
}
