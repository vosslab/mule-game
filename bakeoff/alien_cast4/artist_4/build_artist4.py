#!/usr/bin/env python3
"""Generate Artist 4's Expressionist alien cast."""

from pathlib import Path


OUT = Path(__file__).parent
HYPOTHESIS = """The Expressionist. Personality drives geometry: rounded masses carry gentle and
cheerful characters, hard angles carry sharp and stoic ones, and asymmetry carries sly or
mournful emotion. Distinct bottom edges and one large facial gesture make each being readable
at 18 to 32 px. Frame 2 displaces the feature most tied to each creature's temperament.
Measured frame 1/frame 2 ink coverage: humanoid 61.7/68.0%, flapper 35.6/35.1%, bonzoid
71.9/69.0%, gollumer 64.1/55.8%, spheroid 49.4/50.8%, leggite 59.0/58.8%, mechtron
65.7/63.9%, packer 63.1/51.6%, mule 59.9/60.9%."""


def draw_group(species: str, frame: int, has_face: bool = True) -> str:
	face = f'\n\t\t<use href="#{species}-f{frame}-face"/>' if has_face else ""
	return f'''\t<g id="{species}-f{frame}-draw">
		<use href="#{species}-f{frame}-shapes" fill="#ffffff" stroke="#ffffff" stroke-width="28" stroke-linejoin="round" stroke-linecap="round"/>
		<use href="#{species}-f{frame}-shapes" fill="#141422" stroke="#141422" stroke-width="20" stroke-linejoin="round" stroke-linecap="round"/>
		<use href="#{species}-f{frame}-shapes" fill="currentColor"/>{face}
	</g>'''


def tall_svg(species: str, f1: str, face1: str, f2: str, face2: str,
		crop_x: int = 35, crop_y: int = 0, crop_size: int = 130) -> str:
	return f'''<!-- {HYPOTHESIS} -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320">
<defs>
	<g id="{species}-f1-shapes">
{f1}
	</g>
	<g id="{species}-f1-face">
{face1}
	</g>
{draw_group(species, 1)}
	<g id="{species}-f2-shapes">
{f2}
	</g>
	<g id="{species}-f2-face">
{face2}
	</g>
{draw_group(species, 2)}
	<symbol id="{species}-frame1" viewBox="0 0 200 320"><use href="#{species}-f1-draw"/></symbol>
	<symbol id="{species}-frame2" viewBox="0 0 200 320"><use href="#{species}-f2-draw"/></symbol>
	<symbol id="{species}-head" viewBox="0 0 {crop_size} {crop_size}">
		<g transform="translate(-{crop_x},-{crop_y})"><use href="#{species}-f1-draw"/></g>
	</symbol>
	<symbol id="{species}-silhouette1" viewBox="0 0 200 320"><use href="#{species}-f1-shapes" fill="#141422"/></symbol>
	<symbol id="{species}-silhouette2" viewBox="0 0 200 320"><use href="#{species}-f2-shapes" fill="#141422"/></symbol>
</defs>
<use href="#{species}-frame1" width="200" height="320"/>
</svg>
'''


def mule_svg(f1: str, f2: str) -> str:
	species = "mule"
	return f'''<!-- {HYPOTHESIS} -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
<defs>
	<g id="mule-f1-shapes">
{f1}
	</g>
{draw_group(species, 1, False)}
	<g id="mule-f2-shapes">
{f2}
	</g>
{draw_group(species, 2, False)}
	<symbol id="mule-frame1" viewBox="0 0 320 200"><use href="#mule-f1-draw"/></symbol>
	<symbol id="mule-frame2" viewBox="0 0 320 200"><use href="#mule-f2-draw"/></symbol>
	<symbol id="mule-silhouette1" viewBox="0 0 320 200"><use href="#mule-f1-shapes" fill="#141422"/></symbol>
	<symbol id="mule-silhouette2" viewBox="0 0 320 200"><use href="#mule-f2-shapes" fill="#141422"/></symbol>
</defs>
<use href="#mule-frame1" width="320" height="200"/>
</svg>
'''


CAST = {
	"humanoid": tall_svg("humanoid", '''		<circle cx="100" cy="54" r="31"/>
		<path d="M59 91 Q100 68 141 91 L132 194 Q100 211 68 194 Z"/>
		<path d="M66 94 L39 111 L42 188 L65 180 Z"/>
		<path d="M134 94 L161 111 L158 188 L135 180 Z"/>
		<path d="M75 194 L98 194 L92 284 L58 284 Z"/>
		<path d="M102 194 L125 194 L142 284 L108 284 Z"/>
		<ellipse cx="75" cy="286" rx="25" ry="11"/>
		<ellipse cx="125" cy="286" rx="25" ry="11"/>''', '''		<ellipse cx="87" cy="48" rx="11" ry="10" fill="#ffffff"/>
		<ellipse cx="113" cy="48" rx="11" ry="10" fill="#ffffff"/>
		<circle cx="90" cy="49" r="5" fill="#141422"/>
		<circle cx="116" cy="49" r="5" fill="#141422"/>
		<path d="M78 65 Q100 82 122 65 Q116 91 100 92 Q84 91 78 65" fill="#141422"/>
		<polygon points="91,112 109,112 109,130 91,130" fill="#ffd23f"/>''', '''		<circle cx="102" cy="52" r="31"/>
		<path d="M61 89 Q101 67 141 91 L132 194 Q101 207 70 194 Z"/>
		<path d="M68 94 L42 72 L31 145 L53 150 Z"/>
		<path d="M136 94 L159 118 L174 189 L151 193 Z"/>
		<path d="M74 194 L99 194 L73 286 L39 286 Z"/>
		<path d="M104 194 L129 194 L157 282 L124 282 Z"/>
		<ellipse cx="58" cy="288" rx="25" ry="11"/>
		<ellipse cx="143" cy="284" rx="25" ry="11"/>''', '''		<ellipse cx="89" cy="46" rx="11" ry="10" fill="#ffffff"/>
		<ellipse cx="115" cy="46" rx="11" ry="10" fill="#ffffff"/>
		<circle cx="92" cy="47" r="5" fill="#141422"/>
		<circle cx="118" cy="47" r="5" fill="#141422"/>
		<path d="M80 63 Q102 80 124 63 Q118 89 102 90 Q86 89 80 63" fill="#141422"/>
		<polygon points="93,110 111,110 111,128 93,128" fill="#ffd23f"/>'''),
	"flapper": tall_svg("flapper", '''		<polygon points="93,74 107,74 123,117 104,166 80,120"/>
		<polygon points="91,86 28,62 54,130 91,143"/>
		<polygon points="109,86 172,62 146,130 109,143"/>
		<polygon points="88,76 100,35 112,76"/>
		<polygon points="91,159 72,195 101,176 128,198 108,158"/>''', '''		<ellipse cx="96" cy="66" rx="8" ry="5" fill="#ffffff"/>
		<ellipse cx="106" cy="66" rx="8" ry="5" fill="#ffffff"/>
		<circle cx="98" cy="66" r="3" fill="#141422"/>
		<circle cx="108" cy="66" r="3" fill="#141422"/>
		<polygon points="96,36 100,18 104,36" fill="#ffd23f"/>''', '''		<polygon points="92,101 108,101 122,145 103,190 80,146"/>
		<polygon points="91,119 30,37 68,122 94,157"/>
		<polygon points="109,119 170,37 132,122 106,157"/>
		<polygon points="88,103 100,61 112,103"/>
		<polygon points="91,183 70,218 101,201 130,220 108,182"/>''', '''		<ellipse cx="96" cy="92" rx="8" ry="5" fill="#ffffff"/>
		<ellipse cx="106" cy="92" rx="8" ry="5" fill="#ffffff"/>
		<circle cx="98" cy="92" r="3" fill="#141422"/>
		<circle cx="108" cy="92" r="3" fill="#141422"/>
		<polygon points="96,62 100,44 104,62" fill="#ffd23f"/>''', 35, 8, 130),
	"bonzoid": tall_svg("bonzoid", '''		<ellipse cx="100" cy="72" rx="31" ry="30"/>
		<path d="M61 101 Q100 78 139 101 L145 210 L55 210 Z"/>
		<path d="M63 113 L38 91 L26 48 L43 42 L66 93 Z"/>
		<circle cx="32" cy="38" r="19"/>
		<path d="M137 113 L162 91 L174 48 L157 42 L134 93 Z"/>
		<circle cx="168" cy="38" r="19"/>
		<rect x="32" y="218" width="136" height="54"/>
		<ellipse cx="100" cy="245" rx="48" ry="17"/>''', '''		<ellipse cx="87" cy="67" rx="12" ry="13" fill="#ffffff"/>
		<ellipse cx="114" cy="67" rx="12" ry="13" fill="#ffffff"/>
		<circle cx="90" cy="68" r="6" fill="#141422"/>
		<circle cx="117" cy="68" r="6" fill="#141422"/>
		<ellipse cx="101" cy="91" rx="14" ry="10" fill="#141422"/>''', '''		<ellipse cx="101" cy="72" rx="31" ry="30"/>
		<path d="M62 101 Q101 78 140 101 L146 210 L56 210 Z"/>
		<path d="M65 114 L32 93 L20 126 L40 134 L76 125 Z"/>
		<circle cx="24" cy="130" r="19"/>
		<path d="M137 113 L160 76 L174 38 L156 31 L127 101 Z"/>
		<circle cx="168" cy="30" r="19"/>
		<rect x="33" y="218" width="136" height="54"/>
		<ellipse cx="110" cy="245" rx="48" ry="17"/>''', '''		<ellipse cx="88" cy="67" rx="12" ry="13" fill="#ffffff"/>
		<ellipse cx="115" cy="67" rx="12" ry="13" fill="#ffffff"/>
		<circle cx="91" cy="68" r="6" fill="#141422"/>
		<circle cx="118" cy="68" r="6" fill="#141422"/>
		<ellipse cx="102" cy="91" rx="14" ry="10" fill="#141422"/>'''),
	"gollumer": tall_svg("gollumer", '''		<path d="M37 276 L39 135 Q42 61 94 48 Q130 47 134 102 Q177 125 177 210 Q178 260 163 276 Z"/>''', '''		<ellipse cx="76" cy="112" rx="15" ry="13" fill="#ffffff"/>
		<ellipse cx="108" cy="119" rx="14" ry="12" fill="#ffffff"/>
		<circle cx="74" cy="117" r="6" fill="#141422"/>
		<circle cx="105" cy="124" r="6" fill="#141422"/>
		<ellipse cx="93" cy="150" rx="15" ry="5" fill="#141422"/>''', '''		<path d="M22 276 L27 174 Q32 112 75 102 Q112 93 130 147 Q174 159 186 219 L180 276 Z"/>''', '''		<ellipse cx="65" cy="155" rx="15" ry="12" fill="#ffffff"/>
		<ellipse cx="96" cy="158" rx="14" ry="11" fill="#ffffff"/>
		<circle cx="63" cy="160" r="6" fill="#141422"/>
		<circle cx="93" cy="163" r="6" fill="#141422"/>
		<ellipse cx="80" cy="186" rx="15" ry="5" fill="#141422"/>''', 20, 45, 140),
	"spheroid": tall_svg("spheroid", '''		<ellipse cx="100" cy="100" rx="65" ry="31"/>
		<ellipse cx="100" cy="75" rx="39" ry="40"/>
		<path d="M60 120 L50 224 L65 224 L82 121 Z"/>
		<path d="M91 125 L96 244 L111 244 L110 125 Z"/>
		<path d="M122 121 L142 224 L157 224 L140 118 Z"/>''', '''		<ellipse cx="85" cy="76" rx="16" ry="18" fill="#ffffff"/>
		<ellipse cx="116" cy="76" rx="16" ry="18" fill="#ffffff"/>
		<circle cx="88" cy="78" r="7" fill="#141422"/>
		<circle cx="119" cy="78" r="7" fill="#141422"/>''', '''		<ellipse cx="100" cy="70" rx="69" ry="29"/>
		<ellipse cx="100" cy="47" rx="37" ry="36"/>
		<path d="M56 89 L38 192 L53 196 L79 91 Z"/>
		<path d="M91 96 L110 215 L125 211 L110 94 Z"/>
		<path d="M126 89 L160 182 L175 175 L144 85 Z"/>''', '''		<ellipse cx="85" cy="49" rx="16" ry="18" fill="#ffffff"/>
		<ellipse cx="116" cy="49" rx="16" ry="18" fill="#ffffff"/>
		<circle cx="88" cy="51" r="7" fill="#141422"/>
		<circle cx="119" cy="51" r="7" fill="#141422"/>'''),
	"leggite": tall_svg("leggite", '''		<path d="M83 33 Q116 43 105 94 Q93 133 113 170 Q128 213 106 287 L79 287 Q91 223 78 181 Q66 139 83 103 Z"/>
		<path d="M82 100 L39 77 L31 91 L78 125 Z"/>
		<path d="M105 121 L162 98 L168 114 L108 145 Z"/>
		<path d="M79 159 L27 145 L23 162 L82 183 Z"/>
		<path d="M111 183 L169 172 L173 189 L109 207 Z"/>
		<path d="M84 221 L35 222 L35 240 L84 245 Z"/>
		<path d="M108 247 L158 259 L154 276 L103 271 Z"/>''', '''		<ellipse cx="88" cy="61" rx="9" ry="6" fill="#ffffff"/>
		<ellipse cx="105" cy="63" rx="9" ry="6" fill="#ffffff"/>
		<circle cx="90" cy="62" r="3" fill="#141422"/>
		<circle cx="107" cy="64" r="3" fill="#141422"/>
		<path d="M88 78 Q101 88 113 76 Q104 94 92 91 Z" fill="#141422"/>''', '''		<path d="M67 35 Q104 35 110 84 Q112 119 88 153 Q73 184 103 220 Q123 248 116 287 L87 287 Q92 254 73 229 Q46 193 61 151 Q77 117 72 88 Z"/>
		<path d="M75 96 L29 108 L33 125 L78 119 Z"/>
		<path d="M106 112 L163 132 L157 149 L99 136 Z"/>
		<path d="M68 158 L20 180 L28 196 L75 181 Z"/>
		<path d="M90 175 L169 166 L171 184 L91 200 Z"/>
		<path d="M79 220 L30 247 L39 263 L91 243 Z"/>
		<path d="M104 248 L158 236 L162 253 L111 271 Z"/>''', '''		<ellipse cx="78" cy="59" rx="9" ry="6" fill="#ffffff"/>
		<ellipse cx="95" cy="59" rx="9" ry="6" fill="#ffffff"/>
		<circle cx="80" cy="60" r="3" fill="#141422"/>
		<circle cx="97" cy="60" r="3" fill="#141422"/>
		<path d="M78 75 Q91 85 103 73 Q94 91 82 88 Z" fill="#141422"/>'''),
	"mechtron": tall_svg("mechtron", '''		<rect x="40" y="72" width="120" height="135"/>
		<rect x="48" y="43" width="16" height="33"/>
		<rect x="136" y="43" width="16" height="33"/>
		<rect x="48" y="207" width="35" height="79"/>
		<rect x="117" y="207" width="35" height="79"/>''', '''		<rect x="61" y="105" width="78" height="26" fill="#141422"/>
		<circle cx="79" cy="118" r="8" fill="#ffffff"/>
		<circle cx="121" cy="118" r="8" fill="#ffffff"/>''', '''		<rect x="40" y="76" width="120" height="135"/>
		<rect x="48" y="47" width="16" height="33"/>
		<rect x="136" y="47" width="16" height="33"/>
		<path d="M49 211 L84 211 L75 271 L40 271 Z"/>
		<path d="M117 211 L152 211 L165 286 L130 286 Z"/>''', '''		<rect x="61" y="109" width="78" height="26" fill="#141422"/>
		<circle cx="79" cy="122" r="8" fill="#ffffff"/>
		<circle cx="121" cy="122" r="8" fill="#ffffff"/>'''),
	"packer": tall_svg("packer", '''		<ellipse cx="100" cy="146" rx="72" ry="91"/>
		<rect x="42" y="223" width="17" height="50"/>
		<rect x="70" y="228" width="17" height="45"/>
		<rect x="113" y="228" width="17" height="45"/>
		<rect x="141" y="223" width="17" height="50"/>''', '''		<ellipse cx="87" cy="120" rx="16" ry="18" fill="#ffffff"/>
		<ellipse cx="113" cy="120" rx="16" ry="18" fill="#ffffff"/>
		<circle cx="91" cy="124" r="7" fill="#141422"/>
		<circle cx="109" cy="124" r="7" fill="#141422"/>
		<path d="M70 152 Q100 185 130 152 Q121 197 100 199 Q79 197 70 152" fill="#141422"/>''', '''		<ellipse cx="100" cy="112" rx="72" ry="78"/>
		<path d="M47 174 L68 174 L79 207 L57 213 Z"/>
		<path d="M76 181 L94 181 L98 213 L78 216 Z"/>
		<path d="M106 181 L124 181 L122 216 L102 213 Z"/>
		<path d="M132 174 L153 174 L143 213 L121 207 Z"/>''', '''		<ellipse cx="87" cy="90" rx="16" ry="18" fill="#ffffff"/>
		<ellipse cx="113" cy="90" rx="16" ry="18" fill="#ffffff"/>
		<circle cx="91" cy="94" r="7" fill="#141422"/>
		<circle cx="109" cy="94" r="7" fill="#141422"/>
		<path d="M70 122 Q100 155 130 122 Q121 167 100 169 Q79 167 70 122" fill="#141422"/>''', 30, 55, 140),
}

CAST["mule"] = mule_svg('''		<rect x="95" y="50" width="142" height="62"/>
		<path d="M61 57 L97 62 L97 101 L67 108 L43 91 L43 70 Z"/>
		<polygon points="61,61 57,18 72,56"/>
		<polygon points="78,59 83,16 91,62"/>
		<rect x="28" y="73" width="31" height="22"/>
		<polygon points="237,58 268,43 256,73"/>
		<rect x="106" y="112" width="16" height="55"/>
		<rect x="135" y="112" width="16" height="55"/>
		<rect x="194" y="112" width="16" height="55"/>
		<rect x="221" y="112" width="16" height="55"/>
		<rect x="100" y="164" width="26" height="11"/>
		<rect x="129" y="164" width="26" height="11"/>
		<rect x="188" y="164" width="26" height="11"/>
		<rect x="215" y="164" width="26" height="11"/>''', '''		<rect x="94" y="51" width="142" height="62"/>
		<path d="M60 59 L96 63 L96 102 L66 109 L42 92 L42 71 Z"/>
		<polygon points="60,63 52,23 69,57"/>
		<polygon points="77,61 88,21 90,64"/>
		<rect x="27" y="74" width="31" height="22"/>
		<polygon points="236,59 268,49 252,78"/>
		<path d="M105 113 L121 113 L111 160 L92 173 L82 163 Z"/>
		<path d="M136 113 L152 113 L164 169 L139 169 Z"/>
		<path d="M194 113 L210 113 L220 169 L195 169 Z"/>
		<path d="M220 113 L236 113 L226 160 L207 173 L197 163 Z"/>
		<rect x="78" y="163" width="27" height="11"/>
		<rect x="138" y="166" width="27" height="11"/>
		<rect x="194" y="166" width="27" height="11"/>
		<rect x="203" y="163" width="27" height="11"/>''')


for name, svg in CAST.items():
	(OUT / f"{name}.svg").write_text(svg, encoding="ascii")
