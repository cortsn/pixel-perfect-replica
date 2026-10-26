<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Guest and staff writes go through security-definer database functions (guest token + device id, or staff PIN); tables expose only non-sensitive read access so realtime works without user accounts.
- Booking, device and secret tables (Wi-Fi, staff PIN) have no client grants; read them only inside those functions.
