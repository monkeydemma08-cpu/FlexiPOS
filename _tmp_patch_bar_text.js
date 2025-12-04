from pathlib import Path
path = Path("public/js/bar.js")
text = path.read_text()
replacements = {
    'otro cocinero': 'otro bartender',
    'Cocinero:': 'Bartender:',
    'Otro cocinero': 'Otro bartender',
    'otro cocinero' : 'otro bartender',
}
for old, new in replacements.items():
    text = text.replace(old, new)
path.write_text(text)
