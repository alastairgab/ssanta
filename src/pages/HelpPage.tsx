import { Card, PageHeader, SectionTitle } from '../components/ui/ui';

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Privacy, security & help" subtitle="How this app keeps your exchange private — and the limits you should know about." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="How it works" />
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>You set up the exchange in this browser. Nothing is uploaded — there is no server, database or account.</li>
            <li>The app draws names following your rules, and you confirm the draw. It's frozen with a fingerprint so changes are detectable.</li>
            <li>Each person gets a personal link. Everything they need is encrypted inside the link itself, with a key that's unique to that link.</li>
            <li>You send links using any app you like. When someone opens theirs, their browser decrypts it and plays the reveal.</li>
          </ol>
        </Card>
        <Card>
          <SectionTitle title="What protects the links" />
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>Every link is encrypted with AES-256-GCM using its own random key and a fresh random IV. Tampered links are detected and refused.</li>
            <li>The key lives after the “#” in the link. Browsers never send that part to the website’s server (GitHub Pages), and it isn’t included in referrer headers.</li>
            <li>A link only contains that person’s own match and event details — never anyone else’s assignment, and never your private notes.</li>
            <li>The reveal page loads no analytics, ads or third-party scripts.</li>
          </ul>
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle title="Important limitations" description="A website with no server can’t do everything a server could. Please keep these in mind:" />
          <ul className="grid list-disc gap-x-8 gap-y-2 pl-5 text-sm leading-relaxed md:grid-cols-2">
            <li>
              <strong>The link is the secret.</strong> Anyone who has a person’s link can see their assignment. Send each link privately to the right person.
            </li>
            <li>
              <strong>Links can’t be revoked.</strong> Once sent, a link keeps working forever — even after a redraw. Old links show their draw version so people can tell them apart.
            </li>
            <li>
              <strong>No identity checks.</strong> A static website can’t verify who is opening a link.
            </li>
            <li>
              <strong>No syncing.</strong> Your organiser data is stored only in this browser on this device. Use Backups to move it or keep it safe.
            </li>
            <li>
              <strong>Fingerprints aren’t signatures.</strong> A draw fingerprint (SHA-256) proves a draw hasn’t changed compared with a fingerprint you trust, but not who created or approved it.
            </li>
            <li>
              <strong>“Hide assignments” is visual only.</strong> It hides names on screen. As organiser you can still view everything stored in your browser.
            </li>
            <li>
              <strong>Codenames are just for fun.</strong> They don’t make anyone anonymous — you know who has which codename, and screenshots may reveal them.
            </li>
            <li>
              <strong>No tracking.</strong> The app can’t tell whether someone opened their link, bought a gift or filled in a wishlist. “Shared” status is whatever you mark.
            </li>
            <li>
              <strong>Anonymous questions</strong> are hidden from the recipient, but you (the organiser) can see who asked, and your chat app shows who sent each message.
            </li>
            <li>
              <strong>Wishlists don't update sent links.</strong> If a wishlist changes, create new links for the people who need them.
            </li>
          </ul>
        </Card>
        <Card>
          <SectionTitle title="How the draw is chosen" />
          <p className="text-sm leading-relaxed">
            The draw is a constraint solver. It finds an arrangement where everyone gives and receives exactly once and every rule holds, while using as few repeat pairings as possible.
            Among equally good options it picks at random using your browser’s cryptographic random generator. It is randomised, but it is not guaranteed to pick uniformly among every
            possible valid draw. If no valid draw exists, it tells you why and suggests tested fixes.
          </p>
        </Card>
        <Card>
          <SectionTitle title="Troubleshooting" />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-semibold">A participant says their link doesn’t work</dt>
              <dd className="text-pine-700">Messaging apps sometimes cut long links. Send it again, use the QR code, or create a fresh link from Share links (it keeps the same assignment).</dd>
            </div>
            <div>
              <dt className="font-semibold">My exchanges disappeared</dt>
              <dd className="text-pine-700">Browser data may have been cleared, or you’re in a different browser or private window. Restore from a backup.</dd>
            </div>
            <div>
              <dt className="font-semibold">“No valid draw is possible”</dt>
              <dd className="text-pine-700">Read the explanation; each suggested fix has been tested. Small groups with many rules are the usual cause.</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
