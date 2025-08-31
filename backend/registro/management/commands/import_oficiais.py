from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from registro.models import Produto, MateriaPrima, EstruturaProduto, ItemEstrutura, UnidadeMedida
from pathlib import Path

# Vamos usar pandas pela praticidade.
try:
    import pandas as pd
except ImportError as e:
    raise CommandError("Instale pandas: pip install pandas openpyxl") from e

# ------------- Unidades -------------
VALID_UNIDADES = {u[0] for u in UnidadeMedida.choices}  # {"g","kg","mL","L","un"}

def normalize_unidade(u: str) -> str:
    if not isinstance(u, str):
        return u
    s = u.strip().lower()
    mapa = {
        # mL
        "ml": "mL", "mililitro": "mL", "mililitros": "mL",
        # L
        "l": "L", "lt": "L", "lts": "L", "litro": "L", "litros": "L",
        # g
        "g": "g", "grama": "g", "gramas": "g",
        # kg
        "kg": "kg", "kgs": "kg", "quilo": "kg", "quilos": "kg",
        # un
        "un": "un", "und": "un", "uni": "un", "unid": "un",
        "unidade": "un", "unidades": "un",
    }
    return mapa.get(s, u)

def parse_decimal(v, decimal_comma: bool = False):
    if pd.isna(v):
        return None
    s = str(v).strip()
    if decimal_comma:
        if s.count(",") >= 1:
            s = s.replace(".", "").replace(",", ".")
    else:
        if "," in s and "." not in s:
            s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        raise CommandError(f"Valor numérico inválido: '{v}'")

# ------------- Normalização de nomes de colunas -------------
def ascii_strip(s: str) -> str:
    # Remove acentos sem depender de unidecode
    return (
        s.encode("ascii", "ignore").decode("ascii")
        if isinstance(s, str) else s
    )

def norm_col(s: str) -> str:
    if not isinstance(s, str):
        return s
    s = ascii_strip(s).lower().strip()
    for ch in [" ", "-", ".", "/", "\\", "\t", "\n", "\r"]:
        s = s.replace(ch, "_")
    while "__" in s:
        s = s.replace("__", "_")
    return s.strip("_")

# Aliases aceitos para o CSV de BOM (todos passam por norm_col antes)
ALIASES = {
    "produto_codigo": {
        "produto_codigo", "produto", "produto_cod", "cod_produto",
        "codigo_produto", "produto_ci", "produto_codigo_interno",
        "codigo_produto_interno", "prod_cod", "prod_codigo"
    },
    "mp_codigo": {
        "mp_codigo", "materia_prima_codigo", "mp_cod", "cod_mp",
        "codigo_mp", "mpci", "materia_prima_cod", "materia_prima_ci",
        "mp", "mat_prima_cod"
    },
    "quantidade_por_lote": {
        "quantidade_por_lote", "qtd_por_lote", "quantidade",
        "qtd", "qtd_lote", "quantidade_lote", "qtd_do_lote"
    },
    "unidade": {
        "unidade", "un", "und", "unidad", "unidade_medida",
        "un_med", "unid", "um"
    },
    "estrutura_descricao": {
        "estrutura_descricao", "estrutura", "descricao_estrutura",
        "desc_estrutura"
    },
}

def remap_columns(df: pd.DataFrame, explicit_map: dict | None = None) -> pd.DataFrame:
    """
    Tenta mapear as colunas do df para:
      produto_codigo, mp_codigo, quantidade_por_lote, unidade, (opcional estrutura_descricao)
    Aceita aliases e mapeamento explícito via flags.
    """
    original_cols = list(df.columns)
    norm_map = {c: norm_col(c) for c in original_cols}

    # Inverte: norm -> original
    inv = {}
    for orig, n in norm_map.items():
        inv.setdefault(n, orig)

    target_cols = ["produto_codigo", "mp_codigo", "quantidade_por_lote", "unidade", "estrutura_descricao"]

    mapping = {}

    # 1) Primeiro, honrar mapeamento explícito (se passado)
    explicit_map = explicit_map or {}
    for target in target_cols:
        src = explicit_map.get(target)
        if src:
            src_norm = norm_col(src)
            # aceita tanto nome já normalizado quanto original presente
            if src in df.columns:
                mapping[target] = src
            elif src_norm in inv:
                mapping[target] = inv[src_norm]
            else:
                raise CommandError(f"Mapeamento explícito inválido: '{src}' não encontrado no CSV (target '{target}').")

    # 2) Depois, preencher o que falta por aliases
    for target in target_cols:
        if target in mapping:
            continue
        aliases = ALIASES.get(target, {target})
        found = None
        for a in aliases:
            if a in inv:
                found = inv[a]
                break
        if found:
            mapping[target] = found

    # 3) Validar obrigatórias
    missing = [t for t in ["produto_codigo", "mp_codigo", "quantidade_por_lote", "unidade"] if t not in mapping]
    if missing:
        # Ajuda para debug: mostrar colunas normalizadas e originais
        norm_cols_print = {norm_map[c]: c for c in original_cols}
        raise CommandError(
            "BOM_normalizado.csv não tem as colunas esperadas. "
            f"Faltando: {missing}. "
            f"\nColunas vistas (normalizadas -> original): {norm_cols_print} "
            f"\nVocê pode informar mapeamentos com --map 'chave=coluna' (ex.: --map produto_codigo=produto)."
        )

    # 4) Renomear DataFrame para os nomes alvo
    df2 = df.rename(columns={v: k for k, v in mapping.items() if k in df.columns or v in df.columns})
    # Nota: se a origem já tem um nome igual ao alvo, rename é no-op

    return df2

class Command(BaseCommand):
    help = "Importa produtos, MPs e BOM normalizado a partir dos arquivos oficiais."

    def add_arguments(self, parser):
        parser.add_argument("--produtos", required=True, help="Caminho para produtos.xlsx")
        parser.add_argument("--mps", required=True, help="Caminho para mp.xlsx")
        parser.add_argument("--bom", required=True, help="Caminho para BOM_normalizado.csv")
        parser.add_argument("--estrutura-default", default="Padrão", help="Descrição default da estrutura")
        # Robustez CSV
        parser.add_argument("--sep", default=",", help="Separador do CSV de BOM (padrão ','). Use ';' se necessário.")
        parser.add_argument("--decimal-comma", action="store_true",
                            help="Trata vírgula como separador decimal no CSV de BOM.")
        # Mapeamentos explícitos: pode passar múltiplos --map chave=coluna
        parser.add_argument("--map", action="append", default=[],
                            help="Mapeia colunas do CSV para os alvos. Ex.: --map produto_codigo=produto --map mp_codigo=mp")

    # -------- utilidades --------
    def _check_path(self, p):
        p = Path(p)
        if not p.exists():
            raise CommandError(f"Arquivo não encontrado: {p}")
        return p

    def _coerce_bool(self, v, default=True):
        if pd.isna(v):
            return default
        s = str(v).strip().lower()
        return s in {"1", "true", "t", "sim", "s", "yes", "y", "ativo", "active"}

    @transaction.atomic
    def handle(self, *args, **opts):
        produtos_path = self._check_path(opts["produtos"])
        mps_path = self._check_path(opts["mps"])
        bom_path = self._check_path(opts["bom"])
        estrutura_default = opts["estrutura_default"]
        sep = opts["sep"]
        decimal_comma = bool(opts["decimal_comma"])

        # Parse dos mapeamentos explícitos
        explicit_map = {}
        for m in opts["map"]:
            if "=" not in m:
                raise CommandError(f"Formato de --map inválido: '{m}'. Use --map chave=coluna")
            k, v = m.split("=", 1)
            explicit_map[norm_col(k)] = v  # guarde a coluna original informada

        # ------------------ 1) Produtos ------------------
        df_prod = pd.read_excel(produtos_path)
        df_prod.columns = [norm_col(c) for c in df_prod.columns]
        required_prod_cols = {"codigo_interno", "nome"}
        if not required_prod_cols.issubset(set(df_prod.columns)):
            raise CommandError(f"produtos.xlsx precisa dessas colunas (após normalizar): {required_prod_cols}. "
                               f"Vistas: {df_prod.columns.tolist()}")

        created_p, updated_p = 0, 0
        for _, row in df_prod.iterrows():
            cod = str(row["codigo_interno"]).strip()
            nome = str(row["nome"]).strip()
            ativo = self._coerce_bool(row.get("ativo", True))
            _, created = Produto.objects.update_or_create(
                codigo_interno=cod,
                defaults={"nome": nome, "ativo": ativo},
            )
            created_p += int(created)
            updated_p += int(not created)

        self.stdout.write(self.style.SUCCESS(f"Produtos -> criados: {created_p}, atualizados: {updated_p}"))

        # ------------------ 2) Matérias-primas ------------------
        df_mp = pd.read_excel(mps_path)
        df_mp.columns = [norm_col(c) for c in df_mp.columns]
        required_mp_cols = {"codigo_interno", "nome"}
        if not required_mp_cols.issubset(set(df_mp.columns)):
            raise CommandError(f"mp.xlsx precisa dessas colunas (após normalizar): {required_mp_cols}. "
                               f"Vistas: {df_mp.columns.tolist()}")

        created_m, updated_m = 0, 0
        for _, row in df_mp.iterrows():
            cod = str(row["codigo_interno"]).strip()
            nome = str(row["nome"]).strip()
            ativo = self._coerce_bool(row.get("ativo", True))
            _, created = MateriaPrima.objects.update_or_create(
                codigo_interno=cod,
                defaults={"nome": nome, "ativo": ativo},
            )
            created_m += int(created)
            updated_m += int(not created)

        self.stdout.write(self.style.SUCCESS(f"Matérias-primas -> criadas: {created_m}, atualizadas: {updated_m}"))

        # ------------------ 3) BOM normalizado ------------------
        try:
            df_bom = pd.read_csv(bom_path, sep=sep)
        except Exception as e:
            raise CommandError(f"Falha ao ler BOM_normalizado.csv com sep='{sep}': {e}")

        # Tente remapear colunas para os alvos
        df_bom.columns = [c for c in df_bom.columns]  # preserve originais para debug
        df_bom = remap_columns(df_bom, explicit_map)

        # Agora garanta os nomes-alvo
        # (estrutura_descricao é opcional)
        created_e, reused_e, created_itens, updated_itens = 0, 0, 0, 0

        for prod_code, group in df_bom.groupby("produto_codigo"):
            prod_code = str(prod_code).strip()
            try:
                produto = Produto.objects.get(codigo_interno=prod_code)
            except Produto.DoesNotExist:
                raise CommandError(
                    f"Produto inexistente no banco para codigo_interno='{prod_code}' "
                    f"(verifique produtos.xlsx e BOM)."
                )

            desc = group["estrutura_descricao"].iloc[0] if "estrutura_descricao" in group.columns else estrutura_default
            desc = str(desc).strip() or estrutura_default

            estrutura, e_created = EstruturaProduto.objects.get_or_create(
                produto=produto, descricao=desc, defaults={"ativo": True}
            )
            created_e += int(e_created)
            reused_e += int(not e_created)

            for idx, row in group.iterrows():
                mp_code = str(row["mp_codigo"]).strip()
                try:
                    mp = MateriaPrima.objects.get(codigo_interno=mp_code)
                except MateriaPrima.DoesNotExist:
                    raise CommandError(
                        f"Matéria-prima inexistente para codigo_interno='{mp_code}' (linha {idx + 1})."
                    )

                und_raw = str(row["unidade"])
                und = normalize_unidade(und_raw)
                if und not in VALID_UNIDADES:
                    raise CommandError(
                        f"Unidade '{und_raw}' inválida (linha {idx + 1}). "
                        f"Normalizada -> '{und}'. Válidas: {sorted(VALID_UNIDADES)}."
                    )

                qtd = parse_decimal(row["quantidade_por_lote"], decimal_comma=decimal_comma)
                if qtd is None:
                    raise CommandError(f"quantidade_por_lote vazia (linha {idx + 1}).")
                if qtd <= 0:
                    raise CommandError(f"quantidade_por_lote deve ser > 0 (linha {idx + 1}).")

                _, i_created = ItemEstrutura.objects.update_or_create(
                    estrutura=estrutura, materia_prima=mp,
                    defaults={"quantidade_por_lote": qtd, "unidade": und},
                )
                created_itens += int(i_created)
                updated_itens += int(not i_created)

        self.stdout.write(self.style.SUCCESS(
            f"Estruturas -> criadas: {created_e}, reaproveitadas: {reused_e} | "
            f"Itens -> criados: {created_itens}, atualizados: {updated_itens}"
        ))
        self.stdout.write(self.style.SUCCESS("Importação concluída com sucesso."))
