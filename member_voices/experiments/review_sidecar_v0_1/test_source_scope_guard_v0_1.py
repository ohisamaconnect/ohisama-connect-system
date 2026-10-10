from __future__ import annotations
import copy
import json
from source_scope_guard_v0_1 import BoundaryError, partition, inspect_article

SIGNOFF="おわりです\n投稿者\n#50"
BODY="本人の記事本文。大事な考え方です。\nあらためて未来へ進む。\n" + SIGNOFF
TAIL="\n別の記事『涙はすばらしい』が続く。\n記事一覧\n"
ARTICLE=BODY+TAIL

BASE={"meaning_units":[
 {"unit_ref":"U1","evidence_excerpt":"大事な考え方です。"},
 {"unit_ref":"U2","evidence_excerpt":"涙はすばらしい"}],
 "voice_candidates":[
 {"candidate_ref":"V1","meaning_unit_refs":["U1"],"candidate_decision":"ACCEPT"},
 {"candidate_ref":"V2","meaning_unit_refs":["U2"],"candidate_decision":"ACCEPT"}]}
checks=[]
def check(name, fn, *, expected=True, reject=False):
 try:
  obj=fn()
  passed= bool(obj) if expected else not bool(obj)
  if reject: passed=False
 except (BoundaryError, ValueError, TypeError, KeyError):
  passed=reject
 assert passed, f"FAIL: {name}"
 checks.append(name)

check("partition_unique_signature",lambda: partition(ARTICLE,SIGNOFF).body==BODY)
check("navigation_excluded",lambda: partition(ARTICLE,SIGNOFF).excluded_tail==TAIL)
check("body_unit_allowed",lambda: inspect_article(ARTICLE,SIGNOFF,BASE)["meaning_unit_results"]["U1"]=="ARTICLE_BODY_EXACT_EVIDENCE")
check("neighbor_article_mu_detected",lambda: inspect_article(ARTICLE,SIGNOFF,BASE)["meaning_unit_results"]["U2"]=="SOURCE_SCOPE_CONTAMINATION")
check("neighbor_article_voice_blocked",lambda: inspect_article(ARTICLE,SIGNOFF,BASE)["accepted_candidates_with_nonbody_evidence"]==["V2"])
check("missing_terminal_fails_closed",lambda: partition(ARTICLE,"unknown phrase 987"),reject=True)
check("ambiguous_terminal_fails_closed",lambda: partition(ARTICLE+SIGNOFF,SIGNOFF),reject=True)
check("missing_navigation_fails_closed",lambda: partition(BODY+"still content",SIGNOFF),reject=True)
check("no_tail_fails_closed",lambda: partition(BODY,SIGNOFF),reject=True)
check("short_signature_fails_closed",lambda: partition(ARTICLE,"a"),reject=True)
check("empty_evidence_flags",lambda: inspect_article(ARTICLE,SIGNOFF,{"meaning_units":[{"unit_ref":"U3","evidence_excerpt":""}]})["meaning_unit_results"]["U3"]=="MISSING_EVIDENCE")
check("nonmatching_evidence_flags",lambda: inspect_article(ARTICLE,SIGNOFF,{"meaning_units":[{"unit_ref":"U3","evidence_excerpt":"見つからない根拠"}]})["meaning_unit_results"]["U3"]=="UNMATCHED_EVIDENCE")
check("duplicate_mu_ref_fails",lambda: inspect_article(ARTICLE,SIGNOFF,{"meaning_units":[BASE["meaning_units"][0]]*2}),reject=True)
check("unknown_mu_ref_marks_candidate_review",lambda: inspect_article(ARTICLE,SIGNOFF,{"meaning_units":[BASE["meaning_units"][0]],"voice_candidates":[{"candidate_ref":"VX","candidate_decision":"ACCEPT","meaning_unit_refs":["UNKNOWN"]}]})["accepted_candidates_with_nonbody_evidence"]==["VX"])
check("cannot_mutate_provider",lambda: (lambda x: (inspect_article(ARTICLE,SIGNOFF,x),x==BASE)[1])(copy.deepcopy(BASE)))
check("unicode_indices_codepoints",lambda: partition("👩🏻"+ARTICLE,SIGNOFF).end_codepoints==len("👩🏻"+BODY))
check("same_excerpt_body_and_tail_fails_closed",lambda: inspect_article(ARTICLE+"\n大事な考え方です。\n記事一覧",SIGNOFF,BASE)["meaning_unit_results"]["U1"]=="SOURCE_SCOPE_CONTAMINATION")
check("mixed_good_bad_candidate_rejected",lambda: inspect_article(ARTICLE,SIGNOFF,{"meaning_units":BASE["meaning_units"],"voice_candidates":[{"candidate_ref":"VM","candidate_decision":"ACCEPT","meaning_unit_refs":["U1","U2"]}]})["accepted_candidates_with_nonbody_evidence"]==["VM"])
print(json.dumps({"suite":"MV-SOURCE-SCOPE-v0.1-DRAFT","result":"PASS","total":len(checks),"passed":len(checks),"cases":checks},ensure_ascii=False,indent=2))
