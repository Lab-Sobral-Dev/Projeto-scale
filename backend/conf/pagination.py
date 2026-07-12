# conf/pagination.py
from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    """
    Paginação padrão do projeto.

    Habilita ?page_size=N (limitado a max_page_size) para que telas que
    precisam carregar catálogos completos (ex.: seletores de produtos,
    matérias-primas e estruturas) consigam buscar tudo em poucas requisições,
    evitando que itens recém-cadastrados fiquem "escondidos" fora da 1ª página.
    """
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 1000
