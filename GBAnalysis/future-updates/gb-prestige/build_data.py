#!/usr/bin/env python3
"""Build the future-update guide from reviewed screenshots and frozen icon text."""
from pathlib import Path
from decimal import Decimal
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'data'))
from transcription import BUILDINGS
from guidance import GUIDANCE

OFFICIAL = 'https://support.innogames.com/kb/ForgeOfEmpires/en_DK/6992/Great-Buildings-Prestige-redesigned-the-feature-overview'
LABELS = {
 0: ('Goods Reserve','Daily goods selected from the types of goods buildings placed in your city.'),
 1: ('Aid Copper blueprints','Raises the normal chance of receiving a Copper blueprint when aiding. A 958% boost is not a 958% drop chance.'),
 2: ('Aid Goods','The first listed number of eligible aids award a good from the aided building’s age. Charges refresh when this GB is collected.'),
 3: ('Algorithmic Core','Boosts eligible special-goods collections after Arctic Future, or eligible supply collections before it. The second number is the collection limit.'),
 4: ('Enhanced Critical Hit','Chance to deal 150% damage to an enemy from a different age than your unit. Excludes Rogues. The saved client has variants concerning PvP Arena eligibility.'),
 5: ('Heroic Tavern quest rewards','Extra rewards from Heroic Tavern quests. This is separate from the Copper bonus for ordinary quests.'),
 6: ('Guild goods','Goods delivered to your guild treasury when this GB is collected.'),
 7: ('Guild goods · adjacent eras','Goods for your guild from the previous, current and next era. The client describes the displayed amount as applying to each good.'),
 8: ('Contribution rewards · Copper','Improves rewards for contributions to Copper levels. The October 8 rules distinguish Copper and Gold destination tiers; do not apply this to Gold contributions.'),
 9: ('Contribution rewards · Gold','Improves rewards for contributions to Gold-tier Great Buildings. This is a separate effect from the Copper contribution bonus.'),
 10: ('Critical Hit · same age','Chance to deal 150% damage against enemies of the same age as your unit. The saved client has variants concerning PvP Arena eligibility.'),
 11: ('Diplomatic Gifts','A chance of an extra reward after a successful negotiation, for the listed number of eligible negotiations.'),
 12: ('Double Collection · main city','A chance to double eligible city collections, up to the listed attempt limit. Town Hall and Great Buildings are excluded.'),
 14: ('First Strike','A chance to eliminate one enemy at the start of the first wave, for the listed battle limit. The saved client excludes PvP Arena.'),
 15: ('Goods production boost','Increases goods produced by eligible buildings. Its practical gain depends on your underlying goods production.'),
 16: ('Double Collection · QI','A chance to double eligible Quantum Incursion settlement collections, up to the listed attempt limit. The settlement Town Hall is excluded.'),
 17: ('Happiness','Adds happiness to your city.'),
 18: ('Helping Hands','A chance of an extra reward when you aid another player.'),
 19: ('Improved Helping Hands','A chance of a better reward when you aid another player. The reward pool is not shown in these screenshots.'),
 20: ('Medals','Medals produced when the building is collected.'),
 21: ('Military Ally levels','Adds effective levels to placed Military Historical Allies. The benefit depends on your particular allies.'),
 78: ('Missile Launch · first wave','A chance to eliminate half the enemy units at the start of the first wave, for the listed battle limit. Does not apply against players.'),
 79: ('Missile Launch · second wave','A chance to eliminate half the enemy units at the start of the second wave, for the listed battle limit. Does not apply against players.'),
 80: ('Coins','Coins produced when the building is collected.'),
 81: ('Coin collection boost','Increases the first listed number of coin collections after collecting this GB.'),
 82: ('Mysterious Shards','A chance to create a hidden shard reward in an active cultural settlement. Reward-rarity chances are not included in the screenshot.'),
 83: ('Unattached units','Produces units selected from the types you can produce in your city. Legendary units are excluded by the saved client description.'),
 84: ('Plunder and Pillage','A chance to double the resources you plunder.'),
 85: ('Plunder Goods','The first listed number of eligible plunders award the shown number of extra goods from the plundered building’s age.'),
 86: ('Plunder protection','A chance to repel a plunder attempt, up to the listed attempt limit.'),
 87: ('Population','Adds population to your city.'),
 88: ('Previous-era goods','Goods from the previous era, produced when the building is collected.'),
 89: ('Quest reward boost','Increases eligible coin, supply, goods, diamond and medal quest rewards. Gold has a separate Heroic Tavern effect.'),
 90: ('Goods','Goods produced when the building is collected.'),
 91: ('Relic Hunt','A chance to create a relic after completing a GE encounter. The image does not show the mix of relic rarities.'),
 92: ('Science Ally levels','Adds effective levels to placed Science Historical Allies. The benefit depends on your particular allies.'),
 93: ('Second Strike','A chance to eliminate one enemy at the start of the second wave, for the listed battle limit. The saved client excludes PvP Arena.'),
 94: ('Special goods','Produces special goods after Arctic Future; the saved client describes medals before that era. Eligible goods depend on your age.'),
 95: ('Special-goods production boost','Increases special goods produced by eligible buildings.'),
 96: ('Spoils of War','A chance of an extra reward for each eligible main-city victory, up to the listed battle limit.'),
 97: ('Enhanced Spoils of War','A chance of an enhanced reward after eligible main-city victories, up to the listed battle limit. Reward contents are not shown.'),
 98: ('Forge Points','Forge Points produced when the building is collected.'),
 99: ('Supplies','Supplies produced when the building is collected.'),
 100: ('Supply collection boost','Increases the first listed number of supply collections after collecting this GB.'),
}
MODE = {'all':'All modes','battleground':'GBG','guild_expedition':'GE','guild_raids':'QI'}
ARMY = {'military_boost':'attacking army','fierce_resistance':'defending army','advanced_tactics':'both armies','attack_boost':'attacking army','attacker_defense_boost':'attacking army','defender_attack_boost':'defending army','defense_boost':'defending army'}
STAT = {'military_boost':'Attack & defense','fierce_resistance':'Attack & defense','advanced_tactics':'Attack & defense','attack_boost':'Attack','attacker_defense_boost':'Defense','defender_attack_boost':'Attack','defense_boost':'Defense'}
CHANCE_IDS = {4,10,11,12,14,16,18,19,78,79,82,84,86,91,93,96,97}

def parse_cell(text, pairing):
    if text == '—':
        return {'text':text,'value':None,'charges':None,'unit':None,'perDay':False,'approximate':False}
    match = re.match(r'([+\d,.]+)([KM]?)', text)
    assert match, text
    number = float(Decimal(match[1].replace(',','').lstrip('+')) * {'':1,'K':1000,'M':1000000}[match[2]])
    charge = re.search(r'×(\d+)', text)
    unit = 'percent' if '%' in text else 'levels' if pairing in (21,92) else 'count'
    cell = {'text':text,'value':number,'charges':int(charge[1]) if charge else None,'unit':unit,'perDay':'/24h' in text,'approximate':bool(match[2])}
    if pairing in CHANCE_IDS and charge:
        cell['expectedTriggers'] = round(number / 100 * int(charge[1]), 4)
    return cell

def build():
    tracker = json.loads((ROOT/'data/tracker-catalog.json').read_text())
    sources = json.loads((ROOT/'data/source-manifest.json').read_text())
    original = {x['page_order']: x for x in sources['screenshots']}
    existing = json.loads((ROOT.parent.parent/'data/gb-analysis.json').read_text())
    metadata = {x['name']:x for x in existing['buildings']}
    boosts = {}
    for raw in tracker['boosts']:
        i = raw['id']; kind = raw['bonus_types'][0]
        if i in LABELS:
            label,description = LABELS[i]
            scope = 'City / guild'
        else:
            mode=MODE[raw['target']];army=ARMY[kind];stat=STAT[kind]
            label=f'{stat} {"multiplier" if raw["multiplier"] else "boost"}'
            scope=f'{mode} · {army}'
            description=(f'Adds a percentage of your existing {stat.lower()} bonus for your {army} in {mode}. This is a multiplier, not the same number of flat percentage points.' if raw['multiplier'] else f'Adds the displayed percentage points to {stat.lower()} for your {army} in {mode}.')
        icon = ROOT/raw['icon']
        assert icon.is_file(), icon
        boosts[str(i)] = {**raw,'label':label,'description':description,'scope':scope,'mechanic':'Multiplier' if raw.get('multiplier') else 'Chance' if i in CHANCE_IDS else 'Ally levels' if i in (21,92) else 'Bonus','icon_sha256':hashlib.sha256(icon.read_bytes()).hexdigest()}
    records = []
    for n,name,rows in BUILDINGS:
        gold = n <= 21
        levels = [1,101,201,301,401,500] if gold else [1,101,200]
        priority,target,tags,audience,rationale = GUIDANCE[n]
        meta=metadata.get(name)
        assert meta,(n,name)
        data_rows=[]
        for j,row in enumerate(rows):
            values=row['values'];assert len(values)==len(levels),(name,j)
            key=str(row['pairing']);assert key in boosts
            data_rows.append({'id':f'{n:02d}-{j+1}','boost':key,'tier':'Gold' if values[0]=='—' else 'Copper','values':[parse_cell(v,row['pairing']) for v in values],'match':'Screenshot icon + tracker client pairing'})
        note=[]
        if n==16:
            note.append('Scope conflict: the screenshot’s GBG icon matches the tracker’s defending-army attack-and-defense multiplier. The October 8 announcement calls it defense only. Values are transcribed, but verify the in-game tooltip before counting an attack benefit.')
            data_rows[-1]['match']='Scope conflict — screenshot + tracker differ from announcement'
            data_rows[-1]['uncertain']=True
        if n==22:
            note.append('The image shows a percentage and collection count, without /24h. No daily refresh rate has been inferred from the image.')
        if n in (6,19):
            note.append('The older tracker’s Basic Contribution wording mentions the first 200 levels. That cutoff predates the October 8 redesign; the guide uses the new Copper/Gold destination-tier distinction.')
        records.append({'id':meta['id'],'slug':re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-'),'name':name,'order':n,'gold':gold,'levels':levels,'screenshot':f'screenshots/{n:02d}.png','screenshotSha256':original[n]['sha256'],'sourceImage':original[n]['image_url'],'rows':data_rows,'priority':priority,'checkpoint':target,'tags':tags,'audience':audience,'guidance':rationale,'notes':note,'footprint':{'width':meta['width'],'height':meta['length'],'tiles':meta['width']*meta['length']},'era':existing['eraNames'][str(meta['eraId'])]})
    assert len(records)==49 and len({b['id'] for b in records})==49
    assert sum(b['gold'] for b in records)==21
    data={'schemaVersion':1,'date':'2026-10-08','title':'GB Prestige Update - Boost Preview','sourceArticle':sources['source_url'],'officialRules':OFFICIAL,'trackerSnapshot':tracker['snapshot'],'trackerCheckedAt':tracker['checked_at'],'trackerAssignmentDate':tracker['building_assignments_date'],'tiers':{'copper':{'starts':1,'growthEnds':200},'gold':{'starts':101,'mainGrowthEnds':500,'hardCap':False},'silverRemoved':True},'buildings':records,'boosts':boosts,'methodology':{'values':'Manually read and verified against all 49 original screenshots. K/M rounding and charge counts are preserved.','icons':'Screenshot artwork is matched to the frozen GB tracker client icon/text pairings. Historical GB/tier assignments are not reused.','recommendations':'Gold buildings are reviewed at 201; Copper-only buildings at 101. Guidance considers benefits for the stated play style, not cost, efficiency or payback.','costs':'No October 6 beta costs or live costs are mixed into this October 8 benefit guide.','footprints':'Footprints come from the existing GBAnalysis building metadata, not these screenshots.','gaps':'Only the shown levels are transcribed. Gold screenshots show 201, while the official Copper growth cap is 200. No intermediate values are interpolated.'}}
    out=ROOT/'data/guide-data.json';out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'data/guide-data.js').write_text('window.GB_PRESTIGE_DATA = '+json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('</',r'<\/')+';\n')
    print(f'Built {len(records)} buildings, {sum(len(b["rows"]) for b in records)} boost rows, {sum(len(r["values"]) for b in records for r in b["rows"])} cells and {len(boosts)} icon meanings.')

if __name__=='__main__':build()
