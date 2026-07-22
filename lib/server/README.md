# Serverbibliotek

Den här mappen är avsedd för framtida serverkod. All säkerhetskritisk kod ska ligga på serversidan enligt projektets server-first-princip.

Klienthemligheter får inte förekomma här eller på någon annan plats i projektet. Secrets och privilegierade credentials ska stanna i en kontrollerad servermiljö. En Service Role får aldrig exponeras eller på annat sätt nå klienten.
