"""Backend for the browser editor (frontend lives in editor/).

  http   routing, static files, byte-range video serving
  api    editor operations: load/save projects, add recordings, uploads
  media  preview proxies and cached recordings
  jobs   background render jobs and their progress
  capture  starting/stopping recordings via the Swift recorder
"""
