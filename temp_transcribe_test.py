import io
import wave
import requests
buf=io.BytesIO()
with wave.open(buf,'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(16000)
    wf.writeframes(b'\x00\x00'*16000)
buf.seek(0)
files={'audio':('test.wav',buf,'audio/wav')}
resp=requests.post('http://127.0.0.1:8001/transcribe',files=files,data={'model':'base'})
print('status',resp.status_code)
print(resp.text)
