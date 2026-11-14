"""Expose YAMNet's existing pooled features; do not train or alter its weights.
Usage: python scripts/expose-yamnet-embeddings.py MODEL.tflite SCHEMA_MODULE_DIRECTORY
schema_py_generated.py comes from the tensorflow-cpu==2.19.0 wheel.
Requires numpy and flatbuffers. See public/models/README.md for provenance.
"""
import copy, hashlib, json, pathlib, sys
import flatbuffers
import numpy as np
sys.path.insert(0, sys.argv[2])
import schema_py_generated as s
source=pathlib.Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(source).hexdigest()=='10c95ea3eb9a7bb4cb8bddf6feb023250381008177ac162ce169694d05c317de'
model=s.ModelT.InitFromObj(s.Model.GetRootAsModel(source,0))
g=model.subgraphs[0]
assert g.tensors[115].name==b'tower0/network/layer28/reduce_mean'
assert list(g.tensors[115].shape)==[1,1,1,1024]
assert g.tensors[115].type==s.TensorType.INT8
assert len(g.tensors[115].quantization.scale)==1
assert model.operatorCodes[g.operators[-1].opcodeIndex].builtinCode==s.BuiltinOperator.DEQUANTIZE
output=copy.deepcopy(g.tensors[120]);output.name=b'sonomend_embedding';output.shape=np.array([1,1,1,1024],dtype=np.int32)
output.shapeSignature=None;output.quantization=None
index=len(g.tensors);g.tensors.append(output)
op=copy.deepcopy(g.operators[-1]);op.inputs=np.array([115],dtype=np.int32);op.outputs=np.array([index],dtype=np.int32);g.operators.append(op)
g.outputs=np.array([120,index],dtype=np.int32)
model.description=b'YAMNet with dequantized pooled embeddings exposed by Sonomend; original scores and weights unchanged.'
builder=flatbuffers.Builder(0);builder.Finish(model.Pack(builder),file_identifier=b'TFL3');result=bytes(builder.Output())
root=pathlib.Path(__file__).resolve().parent.parent/'public/models'
(root/'yamnet.tflite').write_bytes(result)
(root.parent.parent/'src/ai/model.json').write_text(json.dumps({'id':'yamnet-int8-sonomend-v1','sha256':hashlib.sha256(result).hexdigest(),'bytes':len(result),'sourceSha256':hashlib.sha256(source).hexdigest(),'sampleRate':16000,'samples':15600,'embeddingSize':1024,'classes':521},indent=2)+'\n')
print((root.parent.parent/'src/ai/model.json').read_text())
