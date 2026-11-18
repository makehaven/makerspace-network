import { REGIONS, spacesIn, regionHref } from '../data';
import { href } from '../App';
import WorkshopPhoto from '../components/WorkshopPhoto';
import { openFeedback } from '../components/FeedbackButton';
import { SHOW_MAKERS_DIRECTORY } from '../features';

export default function Home() {
  const active = REGIONS.filter((r) => r.status === 'active');
  return <div className="discovery">
    <section className="workshop-hero wrap">
      <div className="workshop-intro">
        <h1>Find a makerspace.</h1>
        <p className="workshop-lede">Woodshops, sewing rooms and more, with tools and help for your next project.</p>
        <div className="btn-row"><a className="btn" href="#regions">Find a space</a>{SHOW_MAKERS_DIRECTORY && <a className="text-link" href={href('makers')}>Meet makers</a>}</div>
      </div>
      <figure className="workshop-cover">
        <WorkshopPhoto photo="woodworking" priority />
        <figcaption>At the workbench · MakeHaven, New Haven</figcaption>
      </figure>
    </section>

    <section className="region-section wrap" id="regions" aria-labelledby="regions-title">
      <div className="section-heading"><h2 id="regions-title">Browse by region</h2></div>
      <div className="region-list">{active.map((r) => <a className="region-link" key={r.id} href={regionHref(r)}>
        {r.id === 'us-ct' && <img src="/brand/connecticut-makerspace-network.png" alt="" width="72" height="72" />}
        <div><h3>{r.name}</h3><span>{spacesIn(r).length} spaces</span></div><span className="region-arrow" aria-hidden="true">→</span>
      </a>)}</div>
      <p className="region-invite"><button type="button" className="linkish" onClick={() => openFeedback('I would like to add my region: ')}>Ask to add your region</button></p>
    </section>

    <section className="workshop-stories wrap" aria-labelledby="workshop-title">
      <div className="section-heading"><h2 id="workshop-title">Inside MakeHaven</h2><a href={href('space', { space: 'makehaven' })}>Visit the New Haven listing</a></div>
      <figure className="workshop-story">
        <WorkshopPhoto photo="quilting" />
        <figcaption>Working on a quilt at the longarm machine.</figcaption>
      </figure>
      <figure className="workshop-story">
        <WorkshopPhoto photo="welding" />
        <figcaption>Learning to weld together.</figcaption>
      </figure>
      <p className="photo-credit">Photos courtesy of MakeHaven</p>
    </section>
    <div className="workshop-footer wrap"><a href={href('events')}>Upcoming events</a><a href={href('for-spaces')}>Add or update your space</a></div>
  </div>;
}
