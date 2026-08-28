import type { Region } from '../types';
import { SPACES, REGIONS, REPO_URL } from '../data';

export default function About({ region }: { region: Region | null }) {
  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">About</p>
          <h1>Not another map</h1>
          <p className="lede">
            There is no shortage of makerspace maps. There are at least six, and most of them
            are going stale — because a global crowdsourced map has nobody whose job it is to
            keep any particular corner of it current.
          </p>
        </div>
      </section>

      <div className="wrap narrow prose" style={{ paddingTop: 26 }}>
        <h2>What is different here</h2>
        <ul>
          <li>
            <strong>A named steward per region.</strong> Someone is responsible for these records
            being true.{' '}
            {region?.steward?.organization
              ? <>{region.name} is stewarded by {region.steward.organization}.</>
              : <>Each region names its own.</>}
            {' '}That is a social answer to the staleness problem, not a technical one, and it is
            the only one that has ever worked.
          </li>
          <li>
            <strong>Every record says what it doesn't know.</strong> Sources and gaps are part of
            the data, not an afterthought. An incomplete record with honest gaps is publishable;
            a plausible guess is not.
          </li>
          <li>
            <strong>Operational quality, not just inventory.</strong> Other standards describe
            what a space has, or whether it is open right now. The{' '}
            <a href={`${REPO_URL}/blob/main/tools/standards/README.md`}>Standards of Excellence</a>{' '}
            framework asks whether it is well run.
          </li>
          <li>
            <strong>Interoperation over competition.</strong> We adopt Open Know-Where's
            vocabulary and provenance model, read and publish{' '}
            <a href="https://spaceapi.io">SpaceAPI</a>, and import from{' '}
            <a href="https://www.fablabs.io">fablabs.io</a>.
          </li>
        </ul>

        <h2>The data is the product</h2>
        <p>
          This site is a reader for a folder of JSON files. {SPACES.length} space records across{' '}
          {REGIONS.length} {REGIONS.length === 1 ? 'region' : 'regions'}, a controlled vocabulary,
          and a validator that refuses records claiming more than they can show.
        </p>
        <p>
          Take it. Fork it. Run your own state. The code is MIT and the data is CC BY-SA — the
          share-alike exists so improvements stay as open as they arrived, not to stop you
          leaving. Adding a region is a data change, not a code change.
        </p>

        <h2>Corrections</h2>
        <p>
          If you run one of these spaces, the record about you is a file you can edit. A
          correction is a one-file pull request, and records confirmed by their own space
          outrank anything we inferred. If your space publishes a SpaceAPI endpoint, say so —
          your endpoint then wins over anything stored here, which is how it should be.
        </p>
        <p>
          <a className="btn" href={REPO_URL}>Repository</a>{' '}
          <a className="btn ghost" href={`${REPO_URL}/blob/main/docs/INTEROP.md`}>The full landscape survey</a>
        </p>

        <h2>Other regions</h2>
        <p>
          {REGIONS.length > 1
            ? REGIONS.map((r) => r.name).join(', ')
            : `${REGIONS[0].name} is the first. The platform is multi-region by design — a second state adds a region file and a folder of spaces, not a code change.`}
        </p>
      </div>
    </>
  );
}
