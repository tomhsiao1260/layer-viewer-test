import os
import json
import shutil
import numpy as np

if not os.path.exists('config.json'):
    print('config.json not found')
    exit()

# config & path
with open('config.json') as f:
    config = json.load(f)

OBJ_INPUT = config['OBJ_INPUT']

OBJ_OUTPUT = './output/segment'
OBJ_INFO   = './output/segment/meta.json'

def parse_obj(filename):
    vertices = []
    normals = []
    uvs = []
    faces = []

    with open(filename, 'r') as f:
        for line in f:
            if line.startswith('v '):
                vertices.append([float(x) for x in line[2:].split()])
            elif line.startswith('vn '):
                normals.append([float(x) for x in line[3:].split()])
            elif line.startswith('vt '):
                uvs.append([float(x) for x in line[3:].split()])
            elif line.startswith('f '):
                indices = [x.split('/') for x in line.split()[1:]]
                faces.append(indices)

    data = {}
    data['vertices']    = np.array(vertices)
    data['normals']     = np.array(normals)
    data['uvs']         = np.array(uvs)
    data['faces']       = np.array(faces)

    return data

def save_obj(filename, data):
    vertices = data.get('vertices', np.array([]))
    normals  = data.get('normals' , np.array([]))
    uvs      = data.get('uvs'     , np.array([]))
    faces    = data.get('faces'   , np.array([]))

    with open(filename, 'w') as f:

        for i in range(len(vertices)):
            vertex = vertices[i]
            f.write(f"v {' '.join(str(x) for x in vertex)}\n")

        for i in range(len(normals)):
            normal = normals[i]
            f.write(f"vn {' '.join(str(x) for x in normal)}\n")

        for uv in uvs:
            f.write(f"vt {' '.join(str(x) for x in uv)}\n")

        for face in faces:
            indices = ' '.join(['/'.join(map(str, vertex)) for vertex in face])
            f.write(f"f {indices}\n")

def cal_bounding_box(data):
    vertices = data.get('vertices', np.array([]))
    normals  = data.get('normals' , np.array([]))
    uvs      = data.get('uvs'     , np.array([]))
    faces    = data.get('faces'   , np.array([]))

    # calculate bounding box
    mean_vertices = np.mean(vertices, axis=0)
    max_x = np.max(np.abs(vertices[:, 0] - mean_vertices[0]))
    max_y = np.max(np.abs(vertices[:, 1] - mean_vertices[1]))
    max_z = np.max(np.abs(vertices[:, 2] - mean_vertices[2]))

    bounding_box = {}
    bounding_box['min'] = mean_vertices - np.array([max_x, max_y, max_z])
    bounding_box['max'] = mean_vertices + np.array([max_x, max_y, max_z])

    # translate & rescale
    p_vertices = vertices
    p_normals = normals
    p_uvs = uvs
    p_faces = faces

    p_data = {}
    p_data['vertices']    = p_vertices
    p_data['normals']     = p_normals
    p_data['uvs']         = p_uvs
    p_data['faces']       = p_faces
    p_data['boundingBox'] = bounding_box

    return p_data

def clip_obj(data, l, g):
    vertices = data.get('vertices', np.array([]))

    p_vertices = vertices[(vertices[:, 2] >= (l-g)) & (vertices[:, 2] <= (l+g))]

    p_data = {}
    p_data['vertices'] = p_vertices

    return p_data

gap = 5
layer = 0
SEGMENT_LIST = [ '20230505164332', '20230627122904' ]
LAYER_FOLDER = f'{layer:05d}'

# clear .obj output folder
shutil.rmtree(OBJ_OUTPUT, ignore_errors=True)
os.makedirs(OBJ_OUTPUT)
os.makedirs(os.path.join(OBJ_OUTPUT, LAYER_FOLDER))

meta = {}
meta['segment'] = []

for SEGMENT_ID in SEGMENT_LIST:
    filename = os.path.join(os.path.join(OBJ_INPUT, SEGMENT_ID, f'{SEGMENT_ID}.obj'))

    data = parse_obj(filename)
    p_data = cal_bounding_box(data)

    c = p_data['boundingBox']['min']
    b = p_data['boundingBox']['max']

    c[c < 0] = 0
    b[b < 0] = 0

    info = {}
    info['id'] = SEGMENT_ID
    info['clip'] = {}
    info['clip']['x'] = int(c[0])
    info['clip']['y'] = int(c[1])
    info['clip']['z'] = int(c[2])
    info['clip']['w'] = int(b[0] - c[0])
    info['clip']['h'] = int(b[1] - c[1])
    info['clip']['d'] = int(b[2] - c[2])
    meta['segment'].append(info)

    if (int(c[2]) - gap >= layer or int(b[2]) + gap <= layer): continue

    filename = os.path.join(os.path.join(OBJ_INPUT, SEGMENT_ID, f'{SEGMENT_ID}_points.obj'))
    data = parse_obj(filename)
    p_data = clip_obj(data, layer, gap)
    save_obj(os.path.join(OBJ_OUTPUT, LAYER_FOLDER, f'{SEGMENT_ID}_{LAYER_FOLDER}_points.obj'), p_data)

with open(OBJ_INFO, "w") as outfile:
    json.dump(meta, outfile, indent=4)

with open(f'{OBJ_OUTPUT}/.gitkeep', 'w'): pass

shutil.rmtree('client/public/segment', ignore_errors=True)
shutil.copytree(OBJ_OUTPUT, 'client/public/segment', dirs_exist_ok=True)

