(function(){
  "use strict";

  var pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('fileInput');
  var fileInfo = document.getElementById('fileInfo');
  var fileInfoText = document.getElementById('fileInfoText');
  var changeFileBtn = document.getElementById('changeFileBtn');
  var banner = document.getElementById('banner');
  var settings = document.getElementById('settings');
  var minSizeInput = document.getElementById('minSize');
  var pageRangeInput = document.getElementById('pageRange');
  var extractBtn = document.getElementById('extractBtn');
  var progress = document.getElementById('progress');
  var progressFill = document.getElementById('progressFill');
  var progressText = document.getElementById('progressText');
  var resultsSection = document.getElementById('results');
  var resultsCount = document.getElementById('resultsCount');
  var emptyNote = document.getElementById('emptyNote');
  var downloadAllBtn = document.getElementById('downloadAllBtn');
  var grid = document.getElementById('grid');

  var pdfDoc = null;
  var selectedFile = null;
  var results = [];

  function showBanner(msg){
    banner.textContent = msg;
    banner.hidden = false;
  }
  function clearBanner(){
    banner.hidden = true;
    banner.textContent = '';
  }

  function resetForNewFile(){
    pdfDoc = null;
    selectedFile = null;
    results = [];
    fileInput.value = '';
    fileInfo.hidden = true;
    settings.hidden = true;
    progress.hidden = true;
    resultsSection.hidden = true;
    grid.innerHTML = '';
    extractBtn.disabled = true;
    clearBanner();
  }

  function bytesToSize(bytes){
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
  }

  /* ---------- plain browser download, works on any host ---------- */
  function saveBlob(filename, blob){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- upload wiring ---------- */
  dropzone.addEventListener('click', function(){ fileInput.click(); });
  dropzone.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fileInput.click(); }
  });
  dropzone.addEventListener('dragover', function(e){ e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', function(){ dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', function(e){
    e.preventDefault();
    dropzone.classList.remove('drag');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function(e){
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });
  changeFileBtn.addEventListener('click', resetForNewFile);

  function handleFile(file){
    clearBanner();
    var looksLikePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!looksLikePdf){
      showBanner('That doesn\u2019t look like a PDF. Choose a .pdf file.');
      return;
    }
    if (!pdfjsLib){
      showBanner('The PDF engine didn\u2019t load. Check your connection and reload the page.');
      return;
    }
    selectedFile = file;
    settings.hidden = true;
    resultsSection.hidden = true;
    grid.innerHTML = '';
    results = [];

    file.arrayBuffer().then(function(buf){
      return pdfjsLib.getDocument({ data: buf }).promise;
    }).then(function(doc){
      pdfDoc = doc;
      fileInfoText.textContent = file.name + ' \u00b7 ' + doc.numPages + (doc.numPages === 1 ? ' page' : ' pages') + ' \u00b7 ' + bytesToSize(file.size);
      fileInfo.hidden = false;
      settings.hidden = false;
      extractBtn.disabled = false;
    }).catch(function(err){
      console.error(err);
      showBanner('Couldn\u2019t open that file. It may be encrypted or corrupted.');
    });
  }

  /* ---------- page range parsing (mirrors the python helper) ---------- */
  function parsePages(spec, pageCount){
    var pages = new Set();
    if (!spec || !spec.trim()){
      for (var i = 0; i < pageCount; i++) pages.add(i);
      return pages;
    }
    spec.split(',').forEach(function(partRaw){
      var part = partRaw.trim();
      if (!part) return;
      if (part.indexOf('-') !== -1){
        var bits = part.split('-');
        var start = parseInt(bits[0], 10);
        var end = parseInt(bits[1], 10);
        if (!isNaN(start) && !isNaN(end)){
          for (var p = start - 1; p < end; p++) pages.add(p);
        }
      } else {
        var n = parseInt(part, 10);
        if (!isNaN(n)) pages.add(n - 1);
      }
    });
    var out = new Set();
    pages.forEach(function(p){ if (p >= 0 && p < pageCount) out.add(p); });
    return out;
  }

  /* ---------- image decoding ---------- */
  function getPageImage(page, name){
    return new Promise(function(resolve){
      try {
        page.objs.get(name, function(obj){ resolve(obj); });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function imageObjToPngBlob(imgObj){
    return new Promise(function(resolve){
      try {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');

        if (typeof ImageBitmap !== 'undefined' && imgObj instanceof ImageBitmap){
          canvas.width = imgObj.width;
          canvas.height = imgObj.height;
          ctx.drawImage(imgObj, 0, 0);
        } else if (imgObj && imgObj.bitmap){
          canvas.width = imgObj.bitmap.width;
          canvas.height = imgObj.bitmap.height;
          ctx.drawImage(imgObj.bitmap, 0, 0);
        } else if (imgObj && imgObj.data && imgObj.width && imgObj.height){
          canvas.width = imgObj.width;
          canvas.height = imgObj.height;
          var imageData = ctx.createImageData(imgObj.width, imgObj.height);
          var src = imgObj.data;
          var dst = imageData.data;
          var total = imgObj.width * imgObj.height;
          if (src.length === total * 4){
            dst.set(src);
          } else if (src.length === total * 3){
            for (var s = 0, d = 0; s < src.length; s += 3, d += 4){
              dst[d] = src[s]; dst[d+1] = src[s+1]; dst[d+2] = src[s+2]; dst[d+3] = 255;
            }
          } else if (src.length === total){
            for (var s2 = 0, d2 = 0; s2 < src.length; s2++, d2 += 4){
              dst[d2] = src[s2]; dst[d2+1] = src[s2]; dst[d2+2] = src[s2]; dst[d2+3] = 255;
            }
          } else {
            resolve(null);
            return;
          }
          ctx.putImageData(imageData, 0, 0);
        } else {
          resolve(null);
          return;
        }

        canvas.toBlob(function(blob){ resolve(blob); }, 'image/png');
      } catch (e) {
        console.error(e);
        resolve(null);
      }
    });
  }

  function setProgress(fraction, text){
    progressFill.style.width = Math.round(fraction * 100) + '%';
    progressText.textContent = text;
  }

  /* ---------- extraction ---------- */
  extractBtn.addEventListener('click', function(){
    if (!pdfDoc) return;
    runExtraction();
  });

  function runExtraction(){
    var minSize = Math.max(0, parseInt(minSizeInput.value, 10) || 0);
    var wanted = parsePages(pageRangeInput.value, pdfDoc.numPages);
    var pagesArr = Array.from(wanted).sort(function(a,b){ return a - b; });

    if (pagesArr.length === 0){
      showBanner('That page range doesn\u2019t match this PDF.');
      return;
    }
    clearBanner();

    extractBtn.disabled = true;
    progress.hidden = false;
    resultsSection.hidden = true;
    grid.innerHTML = '';
    results = [];
    setProgress(0, 'Reading page ' + (pagesArr[0] + 1) + ' of ' + pdfDoc.numPages + '\u2026');

    var seen = new Set();
    var counter = 0;
    var i = 0;

    function step(){
      if (i >= pagesArr.length){
        finishExtraction();
        return;
      }
      var pageNum1 = pagesArr[i] + 1;
      setProgress(i / pagesArr.length, 'Reading page ' + pageNum1 + ' of ' + pdfDoc.numPages + '\u2026');

      pdfDoc.getPage(pageNum1).then(function(page){
        return page.getOperatorList().then(function(opList){
          var jobs = [];
          for (var k = 0; k < opList.fnArray.length; k++){
            if (opList.fnArray[k] === pdfjsLib.OPS.paintImageXObject){
              var name = opList.argsArray[k][0];
              if (seen.has(name)) continue;
              seen.add(name);
              jobs.push(name);
            }
          }
          return jobs.reduce(function(chain, name){
            return chain.then(function(){
              return getPageImage(page, name).then(function(imgObj){
                if (!imgObj) return;
                var w = imgObj.width, h = imgObj.height;
                if (imgObj.bitmap){ w = imgObj.bitmap.width; h = imgObj.bitmap.height; }
                if (!w || !h) return;
                if (w < minSize || h < minSize) return;
                return imageObjToPngBlob(imgObj).then(function(blob){
                  if (!blob) return;
                  counter++;
                  var filename = 'page' + String(pageNum1).padStart(3, '0') + '_img' + String(counter).padStart(2, '0') + '_' + w + 'x' + h + '.png';
                  results.push({ name: filename, blob: blob, width: w, height: h, page: pageNum1 });
                });
              });
            });
          }, Promise.resolve());
        });
      }).catch(function(err){
        console.error('page failed', pageNum1, err);
      }).then(function(){
        i++;
        step();
      });
    }
    step();
  }

  function finishExtraction(){
    progress.hidden = true;
    extractBtn.disabled = false;
    renderResults();
  }

  /* ---------- rendering ---------- */
  function renderResults(){
    grid.innerHTML = '';
    resultsSection.hidden = false;

    if (results.length === 0){
      resultsCount.textContent = 'No photos found';
      downloadAllBtn.hidden = true;
      emptyNote.hidden = false;
      return;
    }

    emptyNote.hidden = true;
    downloadAllBtn.hidden = false;
    resultsCount.textContent = results.length + (results.length === 1 ? ' photo found' : ' photos found');

    results.forEach(function(item, idx){
      var url = URL.createObjectURL(item.blob);
      var fig = document.createElement('figure');
      fig.className = 'frame';
      fig.style.animationDelay = (Math.min(idx, 24) * 18) + 'ms';

      var mat = document.createElement('div');
      mat.className = 'mat';
      var img = document.createElement('img');
      img.src = url;
      img.alt = 'Extracted photo ' + (idx + 1) + ', ' + item.width + ' by ' + item.height + ' pixels';
      img.loading = 'lazy';
      mat.appendChild(img);

      var caption = document.createElement('figcaption');
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = item.width + ' \u00d7 ' + item.height + ' \u00b7 page ' + item.page;
      var btn = document.createElement('button');
      btn.className = 'dl-btn';
      btn.type = 'button';
      btn.textContent = 'Save';
      btn.setAttribute('aria-label', 'Download this photo');
      btn.addEventListener('click', function(){ saveBlob(item.name, item.blob); });
      caption.appendChild(meta);
      caption.appendChild(btn);

      fig.appendChild(mat);
      fig.appendChild(caption);
      grid.appendChild(fig);
    });
  }

  /* ---------- download all as zip ---------- */
  downloadAllBtn.addEventListener('click', function(){
    if (!results.length) return;
    downloadAllBtn.disabled = true;
    var prevText = downloadAllBtn.textContent;
    downloadAllBtn.textContent = 'Zipping\u2026';

    var zip = new JSZip();
    results.forEach(function(item){ zip.file(item.name, item.blob); });

    zip.generateAsync({ type: 'blob' }).then(function(zipBlob){
      var base = selectedFile ? selectedFile.name.replace(/\.pdf$/i, '') : 'extracted';
      saveBlob(base + '_images.zip', zipBlob);
    }).catch(function(err){
      console.error(err);
      showBanner('Couldn\u2019t build the ZIP \u2014 try again.');
    }).then(function(){
      downloadAllBtn.disabled = false;
      downloadAllBtn.textContent = prevText;
    });
  });

})();
