import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

const HEADING = "Tietosuojaseloste";

export const metadata: Metadata = { title: HEADING };

/**
 * `/tietosuoja`, from #302.
 *
 * Public and static. Google requires a reachable privacy policy before an OAuth
 * consent screen can leave Testing, and "reachable" means without signing in —
 * so nothing here may read a session.
 *
 * **Every claim below was checked against the code**, not written from memory:
 * the tables are what `src/db/schema.ts` stores, and the third-party section is
 * what the Sentry configuration and `logger.ts` actually send. A policy that
 * describes something else is worse than none, because it reads as deliberate.
 */
const SECTION = "mb-8";
const HEADING_2 = "mb-3 font-semibold text-xl";
const LIST = "list-disc space-y-1 pl-6";

export default function Privacy() {
  return (
    <PageShell heading={HEADING}>
      <p className="mb-8 text-muted text-sm">Päivitetty 9.9.2026</p>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Lyhyesti</h2>
        <p>
          Footy Trends näyttää jalkapallon sarjataulukoita ja otteluita. Sivuston voi lukea
          kirjautumatta, eikä siitä kerätä tietoja lukijoista. Tietoja tallennetaan vain
          kirjautuneesta käyttäjästä, ja tili tietoineen on poistettavissa itse.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Mitä tietoja tallennetaan</h2>
        <p className="mb-3">Kun kirjaudut sisään Google-tilillä, tallennamme seuraavat tiedot:</p>
        <ul className={LIST}>
          <li>Nimi, sähköpostiosoite ja Google-profiilikuvasi osoite.</li>
          <li>
            Googlen antamat kirjautumistunnisteet, joilla kirjautuminen pysyy voimassa. Emme näe
            Google-salasanaasi.
          </li>
          <li>
            Istunnot: milloin kirjauduit ja millä selaimella. Nämä näkyvät sinulle itsellesi sivulla{" "}
            <Link className="hover:underline" href="/asetukset">
              Asetukset
            </Link>
            .
          </li>
          <li>Valitsemasi aloitusnäkymä ja oletussarjat.</li>
          <li>Itse lataamasi profiilikuva, jos olet lisännyt sellaisen.</li>
          <li>Suosikkijoukkueesi ja -sarjasi.</li>
        </ul>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Miksi tietoja käsitellään</h2>
        <p>
          Jotta kirjautuminen toimii ja jotta omat asetuksesi ja suosikkisi näkyvät sinulle.
          Käsittelyn peruste on palvelun toteuttaminen sinulle. Tietoja ei käytetä mainontaan,
          profilointiin eikä myydä eteenpäin.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Kenelle tietoja siirtyy</h2>
        <ul className={LIST}>
          <li>
            <strong>Google</strong> — kirjautuminen. Google kertoo meille nimesi,
            sähköpostiosoitteesi ja profiilikuvasi osoitteen.
          </li>
          <li>
            <strong>Railway</strong> — palvelinten, tietokannan ja välimuistin ylläpitäjä. Tiedot
            sijaitsevat siellä.
          </li>
          <li>
            <strong>Sentry</strong> — virheiden seuranta. Virheilmoituksiin ei liitetä
            käyttäjätunnistetta, eikä tuotannossa IP-osoitteita.
          </li>
          <li>
            <strong>Axiom</strong> — lokit. Jos jokin epäonnistuu, lokiin voi tallentua
            käyttäjätunnisteesi. Se on satunnaisesti arvottu merkkijono, ei nimi eikä
            sähköpostiosoite, eikä siitä voi päätellä kuka olet.
          </li>
        </ul>
        <p className="mt-3">
          Otteludata tulee palveluista football-data.org ja Palloliiton TASO. Niille ei lähetetä
          mitään sinusta.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Kuinka kauan tietoja säilytetään</h2>
        <p className="mb-3">
          Niin kauan kuin tilisi on olemassa. Kun poistat tilin, kaikki edellä luetellut tiedot
          poistetaan samalla.
        </p>
        <p>
          Poikkeuksena lokit: jos jokin on aiemmin epäonnistunut, käyttäjätunnisteesi on voinut
          tallentua lokiin, ja lokit säilyvät oman säilytysaikansa. Tunniste ei kuitenkaan enää
          viittaa mihinkään — tili, jota se tarkoitti, on poistettu — eikä sitä voi yhdistää sinuun.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Miten saat tietosi pois</h2>
        <p>
          Sivulla{" "}
          <Link className="hover:underline" href="/asetukset">
            Asetukset
          </Link>{" "}
          on
          <strong> Poista tili</strong>. Se poistaa tilin ja kaiken siihen liittyvän heti:
          asetukset, profiilikuvan, suosikit ja kirjautumistiedot. Erillistä pyyntöä ei tarvita.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Evästeet</h2>
        <p>
          Käytämme yhtä evästettä, joka pitää kirjautumisesi voimassa. Sitä ei aseteta ennen kuin
          kirjaudut sisään. Seuranta- tai mainosevästeitä ei ole.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Yhteystiedot</h2>
        <p>
          Rekisterinpitäjä on Koodauspaja. Tietosuojaa koskevat kysymykset:{" "}
          <a className="hover:underline" href="mailto:info@koodauspaja.fi">
            info@koodauspaja.fi
          </a>
          {"."}
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Oikeutesi</h2>
        <p>
          Sinulla on oikeus nähdä sinusta tallennetut tiedot, oikaista ne ja poistaa ne. Nimesi ja
          sähköpostiosoitteesi tulevat Google-tililtäsi, joten ne muuttuvat sitä kautta. Poistamisen
          hoidat itse Asetuksista.
        </p>
      </section>
    </PageShell>
  );
}
