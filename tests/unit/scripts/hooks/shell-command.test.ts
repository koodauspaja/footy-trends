import { describe, expect, it } from "vitest";
import { commandWords, simpleCommands } from "../../../../scripts/hooks/shell-command";

/**
 * How the Bash hook reads a command line: which simple commands it runs, with
 * which words, from which directory. A misreading here is a rule enforced on
 * the wrong command, or not at all.
 *
 * decisions/806-push-and-pr-hooks.md
 */

function words(command: string, cwd: string | null = "/repo"): string[][] {
  return simpleCommands(command, cwd).map((simple) => simple.words);
}

describe("simpleCommands", () => {
  it("splits on every operator the shell splits on", () => {
    expect(words("a && b || c; d | e & f\ng")).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["d"],
      ["e"],
      ["f"],
      ["g"],
    ]);
  });

  it("splits a case clause's ;; and a subshell's parentheses", () => {
    expect(words("(a);;b")).toEqual([["a"], ["b"]]);
  });

  it("keeps an operator inside quotes as text", () => {
    expect(words(`gh pr create --title "a && b; c" --body 'x | y'`)).toEqual([
      ["gh", "pr", "create", "--title", "a && b; c", "--body", "x | y"],
    ]);
  });

  it("unescapes only what Bash unescapes inside double quotes", () => {
    expect(words(String.raw`echo "a\"b\\c\$d\`e\n"`)).toEqual([["echo", 'a"b\\c$d`e\\n']]);
  });

  it("reads an unclosed quote to the end of the line", () => {
    expect(words(`echo 'open`)).toEqual([["echo", "open"]]);
    expect(words(`echo "open`)).toEqual([["echo", "open"]]);
  });

  it("joins quoted and unquoted parts of one word", () => {
    expect(words(`echo a"b"'c'd`)).toEqual([["echo", "abcd"]]);
  });

  it("makes an escaped character literal and joins an escaped newline", () => {
    expect(words("echo a\\ b \\&\\& c\\\nd")).toEqual([["echo", "a b", "&&", "cd"]]);
  });

  it("keeps a trailing backslash's nothing as nothing", () => {
    expect(words("echo a\\")).toEqual([["echo", "a"]]);
  });

  it("keeps a substitution as written, operators and all", () => {
    expect(words("echo $(a && (b; c)) `d | e` x")).toEqual([
      ["echo", "$(a && (b; c))", "`d | e`", "x"],
    ]);
  });

  it("keeps a substitution inside double quotes as written", () => {
    expect(words(`echo "x $(a "b" | c) y"`)).toEqual([["echo", 'x $(a "b" | c) y']]);
  });

  it("reads an unclosed substitution to the end", () => {
    expect(words("echo $(a b")).toEqual([["echo", "$(a b"]]);
    expect(words("echo `a b")).toEqual([["echo", "`a b"]]);
    expect(words(`echo "$(a b`)).toEqual([["echo", "$(a b"]]);
  });

  it("reads a heredoc inside a substitution as part of one word", () => {
    const command =
      "git commit -m \"$(cat <<'EOF'\nit's done (#1)\n\ngit add .\nEOF\n)\" && git push";

    expect(words(command)).toEqual([
      ["git", "commit", "-m", "$(cat <<'EOF'\nit's done (#1)\n\ngit add .\nEOF\n)"],
      ["git", "push"],
    ]);
  });

  it("does not read a heredoc's body as commands", () => {
    expect(words("cat > f <<'EOF'\ngit add -A\nEOF\ngit add f")).toEqual([
      ["cat"],
      ["git", "add", "f"],
    ]);
  });

  it("ends an unquoted, a double-quoted and a tab-stripped heredoc at their delimiters", () => {
    expect(words("cat <<END\nx\nEND\na")).toEqual([["cat"], ["a"]]);
    expect(words('cat <<"END"\nx\nEND\na')).toEqual([["cat"], ["a"]]);
    expect(words("cat <<-END\n\tx\n\tEND\na")).toEqual([["cat"], ["a"]]);
  });

  it("reads a heredoc's delimiter after blanks", () => {
    expect(words("cat << \t'END'\nx\nEND\na")).toEqual([["cat"], ["a"]]);
  });

  it("ends a tab-stripping heredoc only at its delimiter, whatever the tabs", () => {
    expect(words("cat <<END\n\tEND\nEND\na")).toEqual([["cat"], ["a"]]);
  });

  it("skips two heredocs opened on one line, in order", () => {
    expect(words("cat <<A <<B\n1\nA\n2\nB\nnext")).toEqual([["cat"], ["next"]]);
  });

  it("swallows the rest when a heredoc never closes", () => {
    expect(words("cat <<EOF\ngit add -A")).toEqual([["cat"]]);
  });

  it("reads a heredoc on the last line with no body at all", () => {
    expect(words("cat <<EOF")).toEqual([["cat"]]);
  });

  it("drops a redirection and its target, a file descriptor included", () => {
    expect(words("a > out 2>&1 < in >> log &> all &>> both 1>| f x")).toEqual([["a", "x"]]);
  });

  it("drops a here-string's word and does not take it for a heredoc", () => {
    expect(words("cat <<< 'git add -A' && b")).toEqual([["cat"], ["b"]]);
  });

  it("keeps a number that is an argument, not a file descriptor", () => {
    expect(words("head -n 2 file")).toEqual([["head", "-n", "2", "file"]]);
  });

  it("drops a comment, but not a # inside a word", () => {
    expect(words("git add a # git add -A\nb c#d")).toEqual([
      ["git", "add", "a"],
      ["b", "c#d"],
    ]);
  });

  it("drops a comment that runs to the end of the text", () => {
    expect(words("a # git add -A")).toEqual([["a"]]);
  });

  it("returns nothing for blank input", () => {
    expect(simpleCommands("  \n\t ", "/repo")).toEqual([]);
  });

  it("follows cd to an absolute or a relative directory", () => {
    const commands = simpleCommands("cd /a/b && x; cd ../c && y", "/repo");

    expect(commands.map((simple) => simple.cwd)).toEqual(["/repo", "/a/b", "/a/b", "/a/c"]);
  });

  it("loses track after a cd it cannot follow, and finds it again after an absolute one", () => {
    for (const target of ["", " -", " ~/x", " $HOME"]) {
      const commands = simpleCommands(`cd${target} && x && cd /y && z && cd w && v`, "/repo");

      expect(commands.map((simple) => simple.cwd)).toEqual([
        "/repo",
        null,
        null,
        "/y",
        "/y",
        "/y/w",
      ]);
    }
  });

  it("cannot follow a relative cd from an unknown directory", () => {
    expect(simpleCommands("cd a && x", null).map((simple) => simple.cwd)).toEqual([null, null]);
  });
});

describe("commandWords", () => {
  it("skips leading assignments", () => {
    expect(commandWords(["A=1", "B_2=x y", "gh", "C=3"])).toEqual(["gh", "C=3"]);
  });

  it("returns nothing when there are only assignments", () => {
    expect(commandWords(["A=1"])).toEqual([]);
  });

  it("does not take a word that only contains = for an assignment", () => {
    expect(commandWords(["--x=1", "y"])).toEqual(["--x=1", "y"]);
  });
});

describe("redirections, scopes and wrappers", () => {
  it("keeps each command's redirection targets apart from its words", () => {
    const commands = simpleCommands("cat > a.md 2>&1 <<'EOF'\nx\nEOF\necho y >> b.md", "/r");

    expect(commands.map(({ words, redirects }) => ({ words, redirects }))).toEqual([
      { words: ["cat"], redirects: ["a.md", "1"] },
      { words: ["echo", "y"], redirects: ["b.md"] },
    ]);
  });

  it("ends a subshell's cd with the subshell", () => {
    const commands = simpleCommands("(cd /a && x) && y; (cd /b; (cd c)) ; z", "/r");

    expect(commands.map((simple) => [simple.words[0], simple.cwd])).toEqual([
      ["cd", "/r"],
      ["x", "/a"],
      ["y", "/r"],
      ["cd", "/r"],
      ["cd", "/b"],
      ["z", "/r"],
    ]);
  });

  it("ignores a closing parenthesis with no subshell open", () => {
    expect(simpleCommands("cd /a ) x", "/r").map((simple) => simple.cwd)).toEqual(["/r", "/a"]);
  });

  it("follows pushd like cd, and loses track after popd", () => {
    const commands = simpleCommands("pushd /a && x && popd && y", "/r");

    expect(commands.map((simple) => simple.cwd)).toEqual(["/r", "/a", "/a", null]);
  });

  it("ends an escaped heredoc delimiter where Bash ends it", () => {
    expect(words("cat <<\\EOF\nx\nEOF\ngit add -A")).toEqual([["cat"], ["git", "add", "-A"]]);
  });
});

describe("commandWords, past keywords and wrappers", () => {
  it("skips shell keywords and wrappers, and names the command without its directory", () => {
    expect(commandWords(["then", "env", "A=1", "/usr/bin/git", "add"])).toEqual(["git", "add"]);
    expect(commandWords(["!", "{", "time", "nohup", "command", "exec", "gh", "pr"])).toEqual([
      "gh",
      "pr",
    ]);
    expect(commandWords(["if", "while", "until", "do", "elif", "else"])).toEqual([]);
  });
});
