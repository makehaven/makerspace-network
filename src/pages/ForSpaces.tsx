import { REPO_URL } from '../data';
import { href, navigate } from '../App';
import { SHOW_MAKERS_DIRECTORY } from '../features';
import { openFeedback } from '../components/FeedbackButton';


export default function ForSpaces() {
  return (
    <>
      <section className="hero">
        <div className="wrap narrow">
          <p className="eyebrow">For organisers</p>
          <h1>Update your space's listing</h1>
          <p className="lede">
            We filled in each listing from public sources. If you run one of these spaces,
            claim your listing and keep it up to date.
          </p>
        </div>
      </section>

      <div className="wrap narrow prose" style={{ paddingTop: 34 }}>
        <section className="notice info">
          <h2>Connect with other organisers</h2>
          <p>Find people at other spaces and partner organisations, or join a group conversation. Open to verified network members.</p>
          <div className="btn-row">
            <a className="btn" href={href('people')}>Space and partner roster</a>
            <a className="btn ghost" href={href('groups')}>Discussion groups</a>
            <a className="btn ghost" href={href('home')}>My network</a>
          </div>
          {SHOW_MAKERS_DIRECTORY && <p>Looking for someone to make things with? <a href={href('makers')}>Meet makers in the public directory</a>.</p>}
        </section>
        <h2>Claim your listing</h2>
        <p>
          Sign in and choose your space. If your email address matches your space's website,
          you can edit the listing straight away. Otherwise the region steward confirms you first.
        </p>
        <div className="btn-row">
          <a className="btn" href={href('join')}
             onClick={(e) => { e.preventDefault(); navigate('join'); }}>Join and claim a listing</a>
          <button type="button" className="btn ghost" onClick={() => openFeedback('Correction to a listing: ')}>Suggest a correction</button>
        </div>

        <h2>More than one person per space</h2>
        <p>
          Add as many people from your space as you like, in two roles:
        </p>
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Role</th><th>Can do</th><th>Cannot do</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>Space admin</strong></td>
                <td>Edit every field on the record, and invite, promote or remove other
                    people at that space.</td>
                <td>Touch any other space's record.</td>
              </tr>
              <tr>
                <td><strong>Space editor</strong></td>
                <td>Edit every field on the record.</td>
                <td>Manage who else has access.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Each region also has a <strong>region steward</strong>, the organisation that runs the
          network in that state. The steward can verify listings and invite spaces, but cannot
          edit your listing. Connecticut's steward is MakeHaven.
        </p>
        <p>
          The first person to claim a listing becomes its space admin. After that, new requests
          from your space go to that admin or the region steward to approve. Invitation links
          work once, expire, and only work for the email address they were sent to.
        </p>
        <p className="notice info">
          After you claim your listing, edit it under Your space and send it. The steward reviews
          changes before they appear in the directory.
        </p>

        <h2>Add a space that is missing</h2>
        <p>
          <button type="button" className="linkish" onClick={() => openFeedback('Please add this space (name and website): ')}>Tell us</button>{' '}
          the space's name and website and we will add it.
        </p>

        <h2>Standards self-assessment</h2>
        <p>
          The{' '}
          <a href={href('standards')}
             onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('standards'); }}>Standards of Excellence</a>{' '}
          let you assess how well your space is run against 84 standards. Find it in My network.
          Only your staff see the answers; the network sees a summary only if you share it.
        </p>
        <p className="muted" style={{ fontSize: '0.86rem' }}>
          Developers: the directory data is <a href={REPO_URL}>on GitHub</a>.
        </p>
      </div>
    </>
  );
}
