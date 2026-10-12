# UTubeConverterMusic

Downloader CLI per Windows che crea file MP3 da contenuti YouTube e YouTube Music accessibili e autorizzati al download. Usa youtube-dl-exec come wrapper di yt-dlp e FFmpeg per estrarre e convertire l'audio. Non aggira DRM, CAPTCHA o controlli di accesso.

Le playlist private o non accessibili non sono supportate. La compatibilità di YouTube Music dipende da ciò che yt-dlp riesce a leggere al momento; non è garantita per ogni playlist o contenuto.

## Prerequisiti

- Windows 10 o successivo.
- Node.js 20 o successivo, preferibilmente LTS.
- Python 3.9 o successivo disponibile da terminale. youtube-dl-exec lo richiede durante l'installazione.
- FFmpeg e ffprobe installati e presenti nel PATH.

Verifica i prerequisiti da PowerShell:

    node --version
    python --version
    ffmpeg -version
    ffprobe -version

Installa Node.js e Python dai rispettivi siti ufficiali. Per FFmpeg, segui i collegamenti ai pacchetti Windows dalla [pagina ufficiale di FFmpeg](https://ffmpeg.org/download.html), quindi aggiungi al PATH la cartella bin che contiene ffmpeg.exe e ffprobe.exe.

## Installazione

Apri PowerShell nella cartella del progetto ed esegui:

    npm.cmd install

L'installazione di youtube-dl-exec scarica il binario yt-dlp una volta durante l'installazione. Il programma non scarica componenti a ogni avvio. Se lo script di installazione non rileva Python, verifica che Python 3.9+ sia nel PATH e ripeti npm.cmd install.

Per aggiornare yt-dlp al rilascio corrente gestito dal pacchetto:

    npm.cmd rebuild youtube-dl-exec

## Avvio interattivo

    npm.cmd start

Il menu permette di scaricare un singolo URL, una playlist, importare URL da un file TXT o elencare gli MP3 presenti.

## Uso da terminale

Un video singolo:

    node src/index.js "https://www.youtube.com/watch?v=ID"

Una playlist:

    node src/index.js "https://www.youtube.com/playlist?list=ID"

Opzioni esplicite, utili anche con URL che contengono un parametro list:

    node src/index.js --single "https://www.youtube.com/watch?v=ID"
    node src/index.js --playlist "https://www.youtube.com/playlist?list=ID"

Per forzare un nuovo download ignorando lo storico:

    node src/index.js --force "https://www.youtube.com/watch?v=ID"

L'opzione --force non sovrascrive MP3 già presenti: aggiunge un suffisso numerico al nuovo file.

Importa più URL da un file, uno per riga. Le righe vuote e quelle che iniziano con # vengono ignorate:

    node src/index.js --file ".\url.txt"
    node src/index.js --file ".\url.txt" --force

## Destinazione e configurazione

Il file [config.json](config.json) contiene i valori iniziali. La destinazione predefinita è C:\UTubeConverterMusic; il programma crea la cartella se manca e non elimina il contenuto esistente. Tutti gli MP3 finali sono salvati nella directory principale.

audioBitrate accetta 128K, 192K, 256K o 320K. maxRetries indica i tentativi aggiuntivi oltre al primo, con una pausa impostata da retryDelayMs. Le impostazioni errate vengono sostituite dal valore predefinito e segnalate.

I file temporanei, lo storico e i metadati sono conservati in .appdata dentro la cartella di destinazione. Lo storico collega ID ed extractor della sorgente al percorso MP3: se il file viene spostato o eliminato, il programma rimuove la voce obsoleta e lo rende scaricabile di nuovo. I file già registrati vengono saltati. Gli URL duplicati nella stessa coda vengono deduplicati.

Il nome file usa artista - traccia quando entrambi i campi sono presenti; altrimenti usa il titolo originale. I nomi vengono sanificati per Windows, conservando Unicode. I tag vengono incorporati tramite yt-dlp quando disponibili.

## Errori e limiti

- I download sono sequenziali. Gli errori di un elemento vengono registrati e la playlist continua.
- La percentuale mostrata proviene dall'output di avanzamento di yt-dlp e compare solo quando disponibile.
- Un MP3 viene registrato nello storico solo dopo che ffprobe ne ha verificato formato e durata.
- URL non HTTPS o fuori dai domini YouTube supportati vengono rifiutati.
- Non vengono usati cookie, credenziali o procedure per superare limitazioni di accesso.
- Ctrl+C richiede l'interruzione del processo yt-dlp corrente e attiva la pulizia dei file temporanei.

## Test

    npm.cmd test

I test coprono configurazione, creazione directory, URL, nomi Windows, storico, file TXT, opzioni yt-dlp, deduplicazione e gestione simulata di un errore di download. Non eseguono download reali.
