import { getPremierLeagueStandings } from "@/lib/standings-service";

const columns = [
  ["O", "Ottelut"],
  ["V", "Voitot"],
  ["T", "Tasapelit"],
  ["H", "Häviöt"],
  ["TM", "Tehdyt maalit"],
  ["PM", "Päästetyt maalit"],
  ["ME", "Maaliero"],
  ["P", "Pisteet"],
] as const;

export default async function Home() {
  const result = await getPremierLeagueStandings();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8">
      <h1 className="mb-8 text-3xl font-semibold">Valioliigan sarjataulukko</h1>
      {result.status === "empty" && <p>Sarjataulukkoa ei ole saatavilla.</p>}
      {result.status === "error" && (
        <p>Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.</p>
      )}
      {result.status === "ok" && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-300 text-sm text-zinc-600">
                <th className="p-3">Sija</th>
                <th className="p-3">Joukkue</th>
                {columns.map(([short, title]) => (
                  <th className="p-3" key={short} title={title}>
                    {short}
                  </th>
                ))}
                <th className="p-3">Vire</th>
              </tr>
            </thead>
            <tbody>
              {result.standings.map((team) => (
                <tr className="border-b border-zinc-200" key={team.teamProviderId}>
                  <td className="p-3">{team.position}</td>
                  <th scope="row" className="p-3 font-medium">
                    {team.teamName}
                  </th>
                  <td className="p-3">{team.played}</td>
                  <td className="p-3">{team.won}</td>
                  <td className="p-3">{team.drawn}</td>
                  <td className="p-3">{team.lost}</td>
                  <td className="p-3">{team.goalsFor}</td>
                  <td className="p-3">{team.goalsAgainst}</td>
                  <td className="p-3">{team.goalDifference}</td>
                  <td className="p-3 font-semibold">{team.points}</td>
                  <td className="p-3" aria-label={team.form.map((item) => item.label).join(", ")}>
                    {team.form.map((item) => (
                      <span className="mr-1" key={item.matchId} title={item.label}>
                        {item.result}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-sm text-zinc-500">
        O = ottelut, V = voitot, T = tasapelit, H = häviöt, TM = tehdyt maalit, PM = päästetyt
        maalit, ME = maaliero, P = pisteet.
      </p>
    </main>
  );
}
