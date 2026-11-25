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

- Stay windows are enforced inside every guest write RPC; guest session replies include server time for the UI countdown and checkout lockout.
- Guest orders are scoped by booking through token/device RPCs; realtime notifications trigger authorized refetches rather than supplying guest order contents.
- PMS simulation and invitation previews are staff-PIN-authorized RPCs; booking inserts generate simulated invitation records via a database trigger.
- Hotel interaction views live in shared hotel components; the map is an explicitly illustrative floor plan, not a verified building plan.
- Roomservice-menuen (`menu_categories`, `menu_items`, `roomservice_settings`) er læsbar for alle, men kun personale-RPC'er skriver. Gæsteappen henter den via `guest_menu`; `guest_order_menu` regner ALTID prisen ud på serveren.
- Regning: `bill_items` (ingen klient-grants). Leveret roomservice lægges automatisk på regningen i `staff_set_order_status`. Annullerede poster beholdes (`voided_at`). Regningen låses ved checkout.
- HotelPilot tager ikke imod betaling. `staff_checkout` registrerer kun, hvordan regningen blev betalt i hotellets eget system, afslutter opholdet, gemmer regningen i `checkouts`, sætter værelset til rengøring og opretter en rengøringsopgave (`cleaning_requests.kind = 'checkout'`).
- Personale logger ind med hovedkoden (`hotel_secrets.staff_pin`) eller en medarbejderkode (`staff_members`, saltet hash). `staff_check` accepterer begge; `internal_*`-funktioner er ikke kaldbare fra klienten.
- Betaling af regning sker uden checkout via `staff_bill_pay` (poster markeres `paid` og knyttes til en `bill_payments`-række). Checkout betaler kun resten og lægger også en betaling i historikken. Tjek ind og ud sker kun under Ankomster & afrejser (`staff_check_in`, `staff_checkout`).
- Billeder til menuvarer uploades fra computeren, forkleines i browseren og gemmes som data-URL i `menu_item_images`; menuen indeholder kun `image_ver`, og gæsteappen henter billedet via `menu_item_image`.
- Gæsteinfo (`staff_guest_info`) viser personer, enheder (`devices.last_seen_at`, `unlock_count`) og aktivitet. Ingen regning eller tjek ind/ud der.
- Roomservice lukker 2 timer før opholdet slutter (`guest_order_menu` kaster `ROOMSERVICE_STAY_ENDING`; gæsteappen viser det samme via `roomserviceStayClosed`). Telefoner (smal skærm) får kun gæsteappen: ingen personaleside, intet skift og ingen demo-tekster.
- Værelseslisten viser kun nummer og gæst; alt andet (lejeperiode, gæster, appadgang, rengøringsstatus, regning, ordrer) ligger i rumvisningen (`staff_room_detail`). "Tjekket ud" under Ankomster & afrejser bruger `staff_checked_out`.
- Tjek ind: `staff_guests` returnerer `room_status`, `last_cleaned_at`, `last_towels_swapped_at`, `last_pool_towels_at`; er værelset ikke `clean`, vises en advarsel, og Tjek ind kræver et ekstra tryk ("Tjek ind alligevel"). `staff_room_care` giver det samme i rumvisningen. Demo-linket vises også på telefonen (kun gæsteappen åbnes der).
- Funktioner til/fra: `staff_features`/`staff_set_feature` (roomservice via `roomservice_settings.enabled`, resten i `hotel_features`); gæsteappen læser `guest_features` og skjuler det, der er slået fra; `guest_order_towels` og `guest_request_cleaning_towels` kaster `FEATURE_OFF`.
- Beskeder til gæster: `announcements` (ingen klient-grants), `staff_post_announcement`/`staff_announcements`/`staff_remove_announcement`, gæsten henter `guest_announcements` og får en popup (kun i appen, ikke push/SMS).
- Opgaver er rengøring + poolhåndklæder samlet (`staff_cleaning` + `staff_orders`). `staff_pool_towels` lukker gæstens åbne håndklæde-bestilling eller opretter en leveret, så 12-timers reglen gælder. Ordrer viser bestillingstid og ventetid, ingen "forsinket".
- Beskeder vises som en boble i siden (aldrig popup) og ligger i historikken "Beskeder fra hotellet"; hotellet vælger udløb pr. besked (`announcements.expires_at`, NULL = opholdet ud). Afvisning: `staff_set_order_status(..., 'rejected', _reason)` bruger `roomservice_settings.reject_message`, hvis årsagen er tom; dialogen forudfylder standardbeskeden. Åbne ordrer kan leveres/afvises direkte i tjek ud-dialogen. Gæstens ordrer (`guest_orders`, nu med `updated_at`) vises som sporing og giver en notifikation ved hver statusændring.
