
import os
from datetime import datetime, timedelta

import mimetypes
import requests
from flask import Flask, jsonify, request, send_from_directory
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

from aps import get_internal_token, get_api_data

# Load environment variables from .env file
load_dotenv()

# Flask app setup
app = Flask(__name__)

MAP_PREPARATION_SECONDS = int(os.getenv('MAPS_PREPARATION_SECONDS', '5'))
DEFAULT_TILESET_URL = os.getenv(
    'MAPS_DEFAULT_TILESET_URL',
    '/maps/demo.kml'
)
MAP_UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads', 'maps')
DOC_UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads', 'documents')
ALLOWED_GIS_EXTENSIONS = {'kml', 'kmz'}
ALLOWED_DOC_EXTENSIONS = {
    'apng', 'avif', 'csv', 'doc', 'docx', 'gif', 'jpeg', 'jpg', 'odp', 'ods',
    'odt', 'pdf', 'png', 'ppt', 'pptx', 'svg', 'txt', 'webp', 'xls', 'xlsx'
}
MAP_JOBS = {}

os.makedirs(MAP_UPLOAD_FOLDER, exist_ok=True)
os.makedirs(DOC_UPLOAD_FOLDER, exist_ok=True)

def allowed_gis_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_GIS_EXTENSIONS

def allowed_doc_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_DOC_EXTENSIONS

def normalize_urn(urn):
    """Replace chars so we can build mock URLs per URN."""
    return ''.join('_' if c in ':/\\' else c for c in urn)


def refresh_job_state(job):
    """Simulate async completion once the fake timer expires."""
    if job['status'] == 'pending' and datetime.utcnow() >= job['ready_at']:
        job['status'] = 'ready'
        if DEFAULT_TILESET_URL:
            job['tileset_url'] = DEFAULT_TILESET_URL
        else:
            job['tileset_url'] = f"/static/tilesets/{normalize_urn(job['urn'])}/tileset.json"
        job['message'] = 'Recurso GIS preparado y listo para Maps.'
    return job


def serialize_job(job):
    """Convert datetime objects into ISO strings for JSON responses."""
    copy = job.copy()
    copy['created_at'] = copy['created_at'].isoformat() + 'Z'
    copy['ready_at'] = copy['ready_at'].isoformat() + 'Z'
    return copy


def upsert_job(urn):
    """Create a fake preparation job or refresh an existing one."""
    job = MAP_JOBS.get(urn)
    created = False
    if job is None:
        now = datetime.utcnow()
        job = {
            'urn': urn,
            'status': 'pending',
            'tileset_url': None,
            'message': 'Solicitud recibida. Generando tileset...',
            'created_at': now,
            'ready_at': now + timedelta(seconds=MAP_PREPARATION_SECONDS)
        }
        MAP_JOBS[urn] = job
        created = True
    refresh_job_state(job)
    return job, created

@app.route('/api/token')
def get_viewer_token():
    token, error = get_internal_token()
    if error:
        return jsonify({'error': error}), 500
    return jsonify({'access_token': token})

@app.route('/api/hubs')
def get_hubs():
    token, error = get_internal_token()
    if error: return jsonify({'error': error}), 500
    data, error = get_api_data('project/v1/hubs', token)
    if error: return jsonify({'error': error}), 500
    return jsonify(data)

@app.route('/api/hubs/<hub_id>/projects')
def get_projects(hub_id):
    token, error = get_internal_token()
    if error: return jsonify({'error': error}), 500
    data, error = get_api_data(f'project/v1/hubs/{hub_id}/projects', token)
    if error: return jsonify({'error': error}), 500
    return jsonify(data)

@app.route('/api/hubs/<hub_id>/projects/<project_id>/topFolders')
def get_top_folders(hub_id, project_id):
    token, error = get_internal_token()
    if error: return jsonify({'error': error}), 500
    data, error = get_api_data(f'project/v1/hubs/{hub_id}/projects/{project_id}/topFolders', token)
    if error: return jsonify({'error': error}), 500
    return jsonify(data)

@app.route('/api/projects/<project_id>/folders/<folder_id>/contents')
def get_folder_contents(project_id, folder_id):
    token, error = get_internal_token()
    if error: return jsonify({'error': error}), 500
    data, error = get_api_data(f'data/v1/projects/{project_id}/folders/{folder_id}/contents', token)
    if error: return jsonify({'error': error}), 500
    return jsonify(data)

@app.route('/api/projects/<project_id>/items/<item_id>/versions')
def get_item_versions(project_id, item_id):
    token, error = get_internal_token()
    if error: return jsonify({'error': error}), 500
    data, error = get_api_data(f'data/v1/projects/{project_id}/items/{item_id}/versions', token)
    if error: return jsonify({'error': error}), 500
    return jsonify(data)

@app.route('/api/maps/prepare', methods=['POST'])
def prepare_maps():
    payload = request.get_json() or {}
    urn = (payload.get('urn') or '').strip()
    if not urn:
        return jsonify({'error': 'El URN es obligatorio.'}), 400
    job, created = upsert_job(urn)
    action = 'Creada' if created else 'Actualizada'
    print(f"{action} preparación Cesium para URN: {urn}")
    return jsonify({'job': serialize_job(job)})


@app.route('/api/maps/status/<path:urn>')
def get_maps_status(urn):
    urn = urn.strip()
    if not urn:
        return jsonify({'error': 'Proporciona un URN válido.'}), 400
    job = MAP_JOBS.get(urn)
    if job is None:
        return jsonify({'error': 'No existe una preparación registrada para este URN.'}), 404
    refresh_job_state(job)
    return jsonify({'job': serialize_job(job)})

@app.route('/api/maps/upload', methods=['POST'])
def upload_gis_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No se envió ningún archivo.'}), 400
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'error': 'Archivo inválido.'}), 400
    if not allowed_gis_file(file.filename):
        return jsonify({'error': 'Solo se permiten archivos KML o KMZ.'}), 400
    filename = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{secure_filename(file.filename)}"
    save_path = os.path.join(MAP_UPLOAD_FOLDER, filename)
    file.save(save_path)
    base = request.host_url.rstrip('/')
    url = f'{base}/maps/uploads/{filename}'
    return jsonify({'url': url})

@app.route('/maps/uploads/<path:filename>')
def serve_uploaded_gis(filename):
    response = send_from_directory(MAP_UPLOAD_FOLDER, filename)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    return response

@app.route('/api/documents/upload', methods=['POST'])
def upload_document_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No se envió ningún archivo.'}), 400
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'error': 'Archivo inválido.'}), 400
    if not allowed_doc_file(file.filename):
        return jsonify({'error': 'Tipo de archivo no soportado.'}), 400
    filename = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{secure_filename(file.filename)}"
    save_path = os.path.join(DOC_UPLOAD_FOLDER, filename)
    file.save(save_path)
    base = request.host_url.rstrip('/')
    url = f'{base}/docs/uploads/{filename}'
    return jsonify({'url': url, 'filename': file.filename, 'content_type': file.mimetype})

@app.route('/docs/uploads/<path:filename>')
def serve_uploaded_document(filename):
    response = send_from_directory(DOC_UPLOAD_FOLDER, filename)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    return response

@app.route('/api/documents/link', methods=['POST'])
def link_acc_document():
    payload = request.get_json() or {}
    project_id = payload.get('projectId')
    version_id = payload.get('versionId')
    display_name = payload.get('name')
    web_view = payload.get('href')
    if not project_id or not version_id:
        return jsonify({'error': 'projectId y versionId son obligatorios.'}), 400
    token, error = get_internal_token()
    if error:
        return jsonify({'error': error}), 500
    result, download_error = download_acc_document(project_id, version_id, token)
    if download_error:
        return jsonify({
            'url': None,
            'filename': display_name or 'Documento',
            'content_type': None,
            'href': web_view,
            'message': download_error
        })
    result['href'] = web_view
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True, port=3000)
def extract_download_url(formats_payload):
    entries = formats_payload.get('data') or formats_payload.get('included') or []
    if isinstance(entries, dict):
        entries = [entries]
    for entry in entries:
        attrs = entry.get('attributes') or {}
        files = attrs.get('files') or attrs.get('formats') or []
        if isinstance(files, dict):
            files = [files]
        for file_entry in files:
            if not isinstance(file_entry, dict):
                continue
            filename = file_entry.get('displayName') or file_entry.get('name') or attrs.get('displayName')
            download_url = file_entry.get('downloadUrl')
            if not download_url:
                links = file_entry.get('links') or {}
                download_url = links.get('download')
                if isinstance(download_url, dict):
                    download_url = download_url.get('href')
            if not download_url:
                download_url = attrs.get('downloadUrl') or attrs.get('url')
                if isinstance(download_url, dict):
                    download_url = download_url.get('href')
            if download_url:
                return download_url, filename
    return None, None


def download_acc_document(project_id, version_id, token):
    formats_endpoint = f'data/v1/projects/{project_id}/versions/{version_id}/downloadFormats'
    formats_data, error = get_api_data(formats_endpoint, token)
    if error:
        return None, error

    download_url, filename = extract_download_url(formats_data)
    if not download_url:
        return None, 'No se encontró un enlace de descarga para este documento.'

    resp = requests.get(download_url, stream=True)
    if resp.status_code != 200:
        return None, f'Descarga fallida ({resp.status_code}).'

    filename = filename or 'document'
    content_type = resp.headers.get('Content-Type') or mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    local_name = f"acc_{version_id.replace(':', '_')}_{secure_filename(filename)}"
    local_path = os.path.join(DOC_UPLOAD_FOLDER, local_name)
    with open(local_path, 'wb') as file_obj:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            if chunk:
                file_obj.write(chunk)

    base = request.host_url.rstrip('/')
    url = f'{base}/docs/uploads/{os.path.basename(local_path)}'
    return {
        'url': url,
        'filename': filename,
        'content_type': content_type
    }, None
