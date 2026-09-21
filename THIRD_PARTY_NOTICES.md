# Third-party notices

The project's MIT license does not replace third-party licenses or confer rights to source articles.
No source article PDFs or original published figures are redistributed.

The build uses CPython (Python Software Foundation license), Pyodide (MPL-2.0),
NumPy (BSD-3-Clause and bundled-library notices), and Plotly.js (MIT).
Build tools retain their own package licenses. The locked runtime distribution and
NumPy wheel are unmodified; their bundled license files are retained. Python source:
https://github.com/python/cpython/tree/v3.14.2
Pyodide source: https://github.com/pyodide/pyodide/tree/314.0.7
NumPy source: https://github.com/numpy/numpy/tree/v2.4.6
Plotly source: https://github.com/plotly/plotly.js

The specification and reference fixtures were supplied for this project. Their
source attributions and limitations remain in docs/SOURCES.md and the original ZIP.
Starter conventions were adapted from the separately supplied scientific Python
starter; no CV or unrelated private repository material was imported.

The optional command-line figure renderer uses Matplotlib 3.11.2 and its dependencies
from the development lock. Matplotlib retains its PSF-based license and bundled
font notices. Matplotlib is not a dependency of the shared production package or
browser engine. Its package license and the DejaVu font license are retained in third_party/.
Source: https://github.com/matplotlib/matplotlib/tree/v3.11.2
