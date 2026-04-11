$root = Join-Path $PSScriptRoot ".."
$dOld = '  <script>(function(){try{var l=localStorage.getItem("walajna_language")||"ar";document.documentElement.setAttribute("lang",l==="en"?"en":"ar");document.documentElement.setAttribute("dir",l==="en"?"ltr":"rtl");}catch(e){}})();</script>'
$dNew = '  <script>(function(){try{var l=localStorage.getItem("walajna_language")||"ar";if(l!=="en"&&l!=="ar"&&l!=="ur")l="ar";document.documentElement.setAttribute("lang",l==="en"?"en":(l==="ur"?"ur":"ar"));document.documentElement.setAttribute("dir",l==="en"?"ltr":"rtl");}catch(e){}})();</script>'
$sOld = "  <script>(function(){try{var l=localStorage.getItem('walajna_language')||'ar';document.documentElement.setAttribute('lang',l==='en'?'en':'ar');document.documentElement.setAttribute('dir',l==='en'?'ltr':'rtl');}catch(e){}})();</script>"
$sNew = "  <script>(function(){try{var l=localStorage.getItem('walajna_language')||'ar';if(l!=='en'&&l!=='ar'&&l!=='ur')l='ar';document.documentElement.setAttribute('lang',l==='en'?'en':(l==='ur'?'ur':'ar'));document.documentElement.setAttribute('dir',l==='en'?'ltr':'rtl');}catch(e){}})();</script>"
$iOld = '  <script src="../js/main/walajna-i18n.js"></script>'
$iNew = "  <script src=""../js/main/walajna-i18n-ur.js""></script>`r`n  <script src=""../js/main/walajna-i18n.js""></script>"

Get-ChildItem -Path $root -Recurse -Filter "*.html" | ForEach-Object {
  $c = [IO.File]::ReadAllText($_.FullName)
  $n = $c
  if ($n.Contains($dOld)) { $n = $n.Replace($dOld, $dNew) }
  if ($n.Contains($sOld)) { $n = $n.Replace($sOld, $sNew) }
  if ($n.Contains($iOld)) { $n = $n.Replace($iOld, $iNew) }
  if ($n -ne $c) {
    [IO.File]::WriteAllText($_.FullName, $n, [Text.UTF8Encoding]::new($false))
    Write-Host "patched" $_.FullName
  }
}
