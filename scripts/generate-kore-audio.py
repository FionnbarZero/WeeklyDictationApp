"""Run with supported gcloud ADC in Cloud Shell; never export credentials.
Input is the public curriculum corpus from prepare-kore-corpus.ts. Resumable,
rate-limited and capped at $0.90 before free allowance, leaving sample reserve.
"""
import base64, concurrent.futures, datetime, hashlib, io, json, math, pathlib, struct, subprocess, threading, time, urllib.error, urllib.request, wave, zipfile

root = pathlib.Path.home() / 'dojo-kore-generation'
root.mkdir(exist_ok=True)
corpus = json.loads((pathlib.Path.home() / 'corpus.json').read_text())
assert corpus['voice'] == 'cmn-CN-Chirp3-HD-Kore' and corpus['speakingRate'] == 0.65
assert sum(len(e['text']) for e in corpus['entries']) * 30 / 1_000_000 < .90
credential = subprocess.run(['gcloud', 'auth', 'application-default', 'print-access-token'], capture_output=True, text=True, check=True).stdout.strip()
headers = {'Authorization': 'Bearer ' + credential, 'x-goog-user-project': 'weeklydictationapp', 'Content-Type': 'application/json; charset=utf-8'}
lock = threading.Lock()
next_request = 0.0
ledger = root / 'requests.jsonl'
charged = sum(json.loads(line)['characters'] for line in ledger.read_text().splitlines()) if ledger.exists() else 0

def generate(entry):
    global next_request, charged
    text, name = entry['text'], entry['id'] + '.wav'
    output, receipt = root / name, root / (name + '.json')
    if output.exists() and receipt.exists():
        data = json.loads(receipt.read_text())
        if data['text'] == text and data['sha256'] == hashlib.sha256(output.read_bytes()).hexdigest(): return data
    for attempt in range(3):
        with lock:
            if (charged + len(text)) * 30 / 1_000_000 > .90: raise RuntimeError('Generation budget reached')
            time.sleep(max(0, next_request - time.monotonic()))
            next_request = time.monotonic() + .45
            charged += len(text)
            with ledger.open('a') as stream: stream.write(json.dumps({'id': entry['id'], 'characters': len(text)}) + '\n')
        payload = {'input': {'text': text}, 'voice': {'languageCode': 'cmn-CN', 'name': corpus['voice']}, 'audioConfig': {'audioEncoding': 'LINEAR16', 'speakingRate': .65}}
        try:
            response = json.load(urllib.request.urlopen(urllib.request.Request('https://texttospeech.googleapis.com/v1/text:synthesize', data=json.dumps(payload).encode(), headers=headers), timeout=45))
            audio = base64.b64decode(response['audioContent'], validate=True)
            with wave.open(io.BytesIO(audio), 'rb') as stream:
                rate, channels, width, frames = stream.getframerate(), stream.getnchannels(), stream.getsampwidth(), stream.getnframes()
                pcm = stream.readframes(frames)
            assert width == 2 and frames > 0
            samples = struct.unpack('<' + 'h' * (len(pcm) // 2), pcm)
            rms = math.sqrt(sum(v*v for v in samples) / len(samples))
            assert rms > 5 and channels == 1
            data = {'text': text, 'file': name, 'sha256': hashlib.sha256(audio).hexdigest(), 'bytes': len(audio), 'durationSeconds': round(frames/rate, 4), 'sampleRate': rate, 'rms': round(rms, 2)}
            output.write_bytes(audio)
            receipt.write_text(json.dumps(data, ensure_ascii=False))
            return data
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2: raise RuntimeError(f'Google synthesis failed: HTTP {error.code} for {entry["id"]}') from None
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError('Unreachable retry state')

results = []
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    futures = [pool.submit(generate, entry) for entry in corpus['entries']]
    for future in concurrent.futures.as_completed(futures):
        results.append(future.result())
        if len(results) % 50 == 0: print('KORE_PROGRESS', len(results), '/', len(futures), flush=True)
results.sort(key=lambda row: row['file'])
manifest = {'schema': 1, 'voice': corpus['voice'], 'languageCode': 'cmn-CN', 'speakingRate': .65, 'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'inputCharactersIncludingRetries': charged, 'costUpperEstimateUsdBeforeFreeAllowance': charged * 30 / 1_000_000, 'assets': results}
(root / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
archive = pathlib.Path.home() / 'dojo-kore-audio.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zipped:
    zipped.write(root / 'manifest.json', 'manifest.json')
    for item in results: zipped.write(root / item['file'], item['file'])
print('KORE_COMPLETE', len(results), 'files', archive, 'SHA256', hashlib.sha256(archive.read_bytes()).hexdigest(), flush=True)
