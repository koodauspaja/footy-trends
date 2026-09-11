import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

const HEADING = "Käyttöehdot";

export const metadata: Metadata = { title: HEADING };

/**
 * `/kayttoehdot`, from #303.
 *
 * Public and static, for the same reason as the privacy policy: Google requires
 * both reachable without signing in before an OAuth consent screen can leave
 * Testing.
 *
 * **What this page deliberately does not say.** It attributes both data sources
 * and states that the data is theirs, and it claims no licence or agreement with
 * either — because football-data.org's free tier is a published permission the
 * app meets, while the TASO arrangement is an open question recorded on #303.
 * Asserting a permission that has not been established would be worse than
 * saying nothing.
 */
const SECTION = "mb-8";
const HEADING_2 = "mb-3 font-semibold text-xl";
const LIST = "list-disc space-y-1 pl-6";

export default function Terms() {
  return (
    <PageShell heading={HEADING}>
      <p className="mb-8 text-muted text-sm">Päivitetty 9.9.2026</p>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Mikä tämä palvelu on</h2>
        <p>
          Footy Trends näyttää jalkapallon sarjataulukoita, otteluita ja joukkueiden tietoja. Se on
          harrasteprojekti, jota tarjotaan maksutta ja sellaisenaan. Sivuston voi lukea
          kirjautumatta; kirjautuminen tuo omat asetukset ja suosikit.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Tiedot tulevat muualta</h2>
        <p className="mb-3">
          Ottelu- ja sarjatiedot eivät ole meidän. Ne haetaan kahdesta lähteestä, ja oikeudet niihin
          kuuluvat niiden tuottajille:
        </p>
        <ul className={LIST}>
          <li>
            <strong>Ulkomaiset sarjat ja arvokisat:</strong> tiedot tarjoaa{" "}
            <a className="hover:underline" href="https://www.football-data.org/">
              football-data.org
            </a>
            {"."}
          </li>
          <li>
            <strong>Kotimaiset sarjat ja cupit sekä Huuhkajien ja Helmarien ottelut:</strong> Suomen
            Palloliiton tulospalvelu.
          </li>
        </ul>
        <p className="mt-3">
          Maajoukkuesivuilla on tietoja molemmista lähteistä: arvokisojen ottelut tulevat
          football-data.orgista ja Huuhkajien ja Helmarien omat otteluluettelot Palloliitolta.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Tiedot voivat olla väärin</h2>
        <p className="mb-3">
          Emme takaa, että sarjataulukot, tulokset tai otteluajat pitävät paikkansa. Ne ovat niin
          oikein kuin lähde ne antaa, ja lähde voi olla väärässä tai myöhässä.
        </p>
        <p>
          Yksi tunnettu rajoitus on syytä sanoa ääneen:{" "}
          <strong>meneillään olevaa kautta vanhempien kausien tietoja ei haeta uudelleen</strong>.
          Jos vanhaan kauteen tehdään jälkikäteen korjaus — esimerkiksi pistevähennys — se ei näy
          täällä. Älä käytä näitä tietoja mihinkään, jolla on merkitystä.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Palvelun käyttö</h2>
        <ul className={LIST}>
          <li>Palvelu on henkilökohtaiseen, ei-kaupalliseen käyttöön.</li>
          <li>
            Älä yritä kuormittaa tai häiritä palvelua, tai hakea siitä tietoa automaattisesti
            massana.
          </li>
          <li>
            Lataamasi profiilikuva on sinun vastuullasi: älä lataa kuvaa, johon sinulla ei ole
            oikeutta.
          </li>
        </ul>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Tili</h2>
        <p>
          Voit poistaa tilisi milloin tahansa sivulla{" "}
          <Link className="hover:underline" href="/asetukset">
            Asetukset
          </Link>
          . Voimme sulkea tilin, jos palvelua käytetään näiden ehtojen vastaisesti. Palvelu voi myös
          muuttua tai lakata olemasta ilman erillistä ilmoitusta — se on harrasteprojekti, ei
          sitoumus.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Vastuunrajoitus</h2>
        <p>
          Palvelu tarjotaan sellaisenaan, ilman mitään takuuta. Emme vastaa vahingosta, joka syntyy
          palvelun käytöstä tai siitä, ettei se ole saatavilla.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Ehtojen muuttaminen</h2>
        <p>
          Näitä ehtoja voidaan muuttaa. Sivun yläreunassa näkyy, milloin niitä on viimeksi muutettu.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={HEADING_2}>Yhteystiedot</h2>
        <p>
          Palvelusta vastaa Koodauspaja.{" "}
          <a className="hover:underline" href="mailto:info@koodauspaja.fi">
            info@koodauspaja.fi
          </a>
          . Henkilötietojen käsittely on kuvattu{" "}
          <Link className="hover:underline" href="/tietosuoja">
            tietosuojaselosteessa
          </Link>
          .
        </p>
      </section>
    </PageShell>
  );
}
