import type { Region } from '../types';
import { SPACES, REGIONS, REPO_URL } from '../data';
import { href } from '../App';
import { openFeedback } from '../components/FeedbackButton';

export default function About({ region }: { region: Region | null }) {
  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">About</p>
          <h1>About the network</h1>
          <p className="lede">
            There are at least six makerspace maps already, and most are out of date because
            nobody is responsible for keeping any one area current. Here, each region has someone
            who is.
          </p>
        </div>
      </section>

      <div className="wrap narrow prose" style={{ paddingTop: 26 }}>
        <h2>How this directory works</h2>
        <ul>
          <li>
            <strong>A named steward per region.</strong> Someone is responsible for these records
            being true.{' '}
            {region?.steward?.organization
              ? <>{region.name} is stewarded by {region.steward.organization}.</>
              : <>Each region names its own.</>}
          </li>
          <li>
            <strong>Every listing shows its sources.</strong> Anything we could not confirm is
            listed as missing instead of guessed.
          </li>
          <li>
            <strong>How well a space is run.</strong> Other directories list equipment and
            opening hours. The{' '}
            <a href={`${REPO_URL}/blob/main/tools/standards/README.md`}>Standards of Excellence</a>{' '}
            help a space assess how well it is run.
          </li>
          <li>
            <strong>Works with other directories.</strong> We use Open Know-Where's
            vocabulary, read and publish{' '}
            <a href="https://spaceapi.io">SpaceAPI</a>, and import from{' '}
            <a href="https://www.fablabs.io">fablabs.io</a>.
          </li>
        </ul>

        <h2>Open data</h2>
        <p>
          The directory has {SPACES.length} spaces in {REGIONS.length}{' '}
          {REGIONS.length === 1 ? 'region' : 'regions'}, stored as open data files. The code is
          MIT licensed and the data is CC BY-SA, so you can reuse it or run your own region.
        </p>

        <h2>Corrections</h2>
        <p>
          If you run one of these spaces,{' '}
          <a href={href('for-spaces')}>claim your listing</a> to correct it, or{' '}
          <button type="button" className="linkish" onClick={() => openFeedback('Correction to a listing: ')}>suggest a correction</button>.
          If your space publishes a SpaceAPI endpoint, tell us and we will use it for your listing.
        </p>
        <p className="muted" style={{ fontSize: '0.86rem' }}>
          Developers: the code and data are <a href={REPO_URL}>on GitHub</a>, along with a{' '}
          <a href={`${REPO_URL}/blob/main/docs/INTEROP.md`}>survey of other makerspace directories</a>.
        </p>

        <h2>Other regions</h2>
        <p>
          {REGIONS.length > 1
            ? REGIONS.map((r) => r.name).join(', ')
            : `${REGIONS[0].name} is the first region. Others can be added without new code.`}
        </p>
      </div>
    </>
  );
}
