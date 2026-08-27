import { ArrowUpRight, Sparkles } from 'lucide-react';
import { brand } from '@/data/brand';
import { useLanguage } from '@/context/language-context';

const campaigns = [
  { src: '/assets/venture-funds/campaign-01.png', label: 'brand.campaignOne' },
  { src: '/assets/venture-funds/campaign-02.png', label: 'brand.campaignTwo' },
  { src: '/assets/venture-funds/campaign-03.png', label: 'brand.campaignThree' },
  { src: '/assets/venture-funds/campaign-04.png', label: 'brand.campaignFour' },
] as const;

export function VentureCampaignRail({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();

  return (
    <section className={`venture-campaign-rail ${compact ? 'venture-campaign-rail--compact' : ''}`} aria-label={brand.name}>
      <div className="venture-campaign-rail__copy">
        <span className="eyebrow"><Sparkles size={13} /> {t('brand.campaignEyebrow')}</span>
        <h2>{t('brand.campaignTitle')}</h2>
        <p>{t('brand.campaignText')}</p>
        <div className="venture-campaign-rail__status">
          <span className="status-dot status-dot--live" />
          <span>{t('brand.campaignStatus')}</span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </div>
      </div>
      <div className="venture-campaign-rail__gallery">
        {campaigns.map((campaign, index) => (
          <figure className="venture-campaign-rail__item" key={campaign.src}>
            <img src={campaign.src} alt="" loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />
            <figcaption><span>0{index + 1}</span>{t(campaign.label)}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
